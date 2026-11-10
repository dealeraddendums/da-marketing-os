import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, unlinkSync } from "fs"
import { join } from 'path'
import matter from 'gray-matter'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, postFilePath, safeSlug, POSTS_DIR, type BlogFrontmatter } from '@/lib/blog'
import { writeRevision, rekeyRevisions, type RevisionEvent } from '@/lib/blog-revisions'
import { submitUrlForIndexing, notifyUrlDeleted, type IndexingResult } from '@/lib/google/indexing'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function revalidateBlog(slug: string, oldSlug?: string) {
  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  if (oldSlug && oldSlug !== slug) revalidatePath(`/blog/${oldSlug}`)
  revalidatePath('/sitemap.xml')
  revalidatePath('/') // footer Resources row
}

// The editor's save endpoint.
//
// action:
//   'save'    — keep the current status. Draft: just writes the file (no
//               revision — drafts are logged on publish only). Published:
//               stamps updatedAt, writes a revision, re-submits to the
//               Indexing API, revalidates blog + sitemap.
//   'publish' — draft → published: stamps date (published_at), writes a
//               'publish' revision, submits to the Indexing API.
//
// Slug change: newSlug renames the file. On a PUBLISHED post the old slug is
// recorded in previousSlugs (middleware 301s it) and the old URL gets a
// URL_DELETED notification; the revision event becomes 'slug_change'.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await req.json()
  const {
    slug,
    action = 'save',
    changeSummary = '',
    title,
    newSlug,
    metaTitle,
    metaDescription,
    excerpt,
    featured,
    body,
    updateNotice,
    editorNote,
    reviewBy,
    humanized, // true when the body being saved came from "Humanize with Phrasly"
  } = payload as Record<string, any>

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  if (action !== 'save' && action !== 'publish') {
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  }

  const existing = getPost(slug)
  if (!existing) return NextResponse.json({ error: `No post "${slug}"` }, { status: 404 })
  if (existing.status === 'archived') {
    return NextResponse.json({ error: 'Post is archived — restore it to draft before editing' }, { status: 409 })
  }
  if (typeof title === 'string' && !title.trim()) {
    return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
  }
  if (typeof body === 'string' && !body.trim()) {
    return NextResponse.json({ error: 'body cannot be empty' }, { status: 400 })
  }

  // ── Frontmatter: start from what's on disk, apply only provided fields ──
  const fm: BlogFrontmatter = { ...existing.frontmatter }
  if (typeof title === 'string') fm.title = title.trim()
  if (typeof metaTitle === 'string') { if (metaTitle.trim()) fm.metaTitle = metaTitle.trim(); else delete fm.metaTitle }
  if (typeof metaDescription === 'string') { if (metaDescription.trim()) fm.metaDescription = metaDescription.trim(); else delete fm.metaDescription }
  if (typeof excerpt === 'string') { if (excerpt.trim()) fm.excerpt = excerpt.trim(); else delete fm.excerpt }
  if (typeof featured === 'boolean') { if (featured) fm.featured = true; else delete fm.featured }
  if (typeof updateNotice === 'string') { if (updateNotice.trim()) fm.updateNotice = updateNotice.trim(); else delete fm.updateNotice }
  if (typeof editorNote === 'string') { if (editorNote.trim()) fm.editorNote = editorNote.trim(); else delete fm.editorNote }
  if (typeof reviewBy === 'string') { if (reviewBy.trim()) fm.reviewBy = reviewBy.trim(); else delete fm.reviewBy }
  // Phrasly provenance: the saved body came from "Humanize with Phrasly".
  if (humanized === true) fm.humanizedAt = new Date().toISOString()
  const newBody: string = typeof body === 'string' ? body : existing.content

  const wasPublished = existing.status === 'published'
  const publishing = action === 'publish' && !wasPublished

  // ── Status / date stamps ──
  if (publishing) {
    fm.status = 'published'
    fm.date = today()
    delete fm.updatedAt
  } else if (wasPublished) {
    fm.status = 'published'
    fm.updatedAt = today()
  } else {
    fm.status = 'draft'
  }

  // ── Slug change ──
  let finalSlug = slug
  let renamed = false
  if (typeof newSlug === 'string' && newSlug.trim() && safeSlug(newSlug) !== slug) {
    const target = safeSlug(newSlug)
    if (!target) return NextResponse.json({ error: 'Invalid new slug' }, { status: 400 })
    if (postFilePath(target)) {
      return NextResponse.json({ error: `A post with slug "${target}" already exists` }, { status: 409 })
    }
    finalSlug = target
    renamed = true
    if (wasPublished) {
      // Auto-301: old slug is remembered; middleware + the archive map 301 it.
      const prev = new Set(fm.previousSlugs || [])
      prev.add(slug)
      prev.delete(finalSlug)
      fm.previousSlugs = Array.from(prev)
    }
  }

  // ── Write the file (new path first, then remove the old on rename) ──
  const outPath = join(POSTS_DIR(), `${finalSlug}.mdx`)
  writeFileSync(outPath, matter.stringify(newBody, fm), 'utf-8')
  if (renamed) {
    const oldPath = postFilePath(slug)
    // postFilePath(slug) now may resolve to the new file only if same name; it
    // resolves the OLD slug's file, which still exists — remove it.
    if (oldPath && oldPath !== outPath) unlinkSync(oldPath)
  }

  // ── Revision log ──
  // On a rename, re-key the existing history to the new slug first so the
  // post's whole revision trail follows it (the slug IS the post's identity).
  if (renamed) await rekeyRevisions(slug, finalSlug)
  let event: RevisionEvent | null = null
  if (publishing) event = 'publish'
  else if (wasPublished) event = renamed ? 'slug_change' : 'save'
  // draft saves: no revision (logged on publish only) — EXCEPT a humanized
  // save, which always logs so the Phrasly provenance trail is complete
  // (the pre-humanize snapshot was written by /api/blog/humanize).
  else if (humanized === true) event = 'save'
  if (event) {
    let summary: string = changeSummary || ''
    if (humanized === true && !/phrasly/i.test(summary)) {
      summary = summary ? `${summary} [Humanized via Phrasly]` : 'Humanized via Phrasly'
    }
    await writeRevision({
      slug: finalSlug,
      event,
      frontmatter: fm,
      body: newBody,
      changeSummary: renamed ? `${summary} [slug: ${slug} → ${finalSlug}]`.trim() : summary,
    })
  }

  // ── Revalidate + Indexing API ──
  revalidateBlog(finalSlug, slug)
  let indexing: IndexingResult | null = null
  let indexingDeleted: IndexingResult | null = null
  if (publishing || wasPublished) {
    indexing = await submitUrlForIndexing(`${SITE_URL}/blog/${finalSlug}`)
    if (renamed && wasPublished) {
      indexingDeleted = await notifyUrlDeleted(`${SITE_URL}/blog/${slug}`)
    }
  }

  return NextResponse.json({
    ok: true,
    slug: finalSlug,
    renamedFrom: renamed ? slug : undefined,
    status: fm.status,
    date: fm.date,
    updatedAt: fm.updatedAt,
    url: `/blog/${finalSlug}`,
    revision: event,
    indexing,
    indexingDeleted,
  })
}
