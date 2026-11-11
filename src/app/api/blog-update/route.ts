import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, safeSlug, type BlogFrontmatter } from '@/lib/blog'
import { dbSavePost, dbRenamePost, dbSlugExists } from '@/lib/blog-store'
import { writeRevision, type RevisionEvent } from '@/lib/blog-revisions'
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

// The editor's save endpoint (writes to Supabase blog_posts, migration 024).
//   'save'    — keep current status. Draft: no revision (logged on publish) unless
//               humanized. Published: stamp updatedAt, revision, re-index.
//   'publish' — draft → published: stamp date (published_at), 'publish' revision,
//               submit to the Indexing API.
// Slug change renames the row in place (same id → revision history follows); on a
// PUBLISHED post the old slug is recorded in previousSlugs (middleware 301s it)
// and the old URL gets a URL_DELETED notification.
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
    humanized, // true when the body came from "Humanize with Phrasly"
  } = payload as Record<string, any>

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }
  if (action !== 'save' && action !== 'publish') {
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  }

  const existing = await getPost(slug, true)
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

  // ── Frontmatter: start from the post, apply only provided fields ──
  const fm: BlogFrontmatter = { ...existing.frontmatter }
  if (typeof title === 'string') fm.title = title.trim()
  if (typeof metaTitle === 'string') { if (metaTitle.trim()) fm.metaTitle = metaTitle.trim(); else delete fm.metaTitle }
  if (typeof metaDescription === 'string') { if (metaDescription.trim()) fm.metaDescription = metaDescription.trim(); else delete fm.metaDescription }
  if (typeof excerpt === 'string') { if (excerpt.trim()) fm.excerpt = excerpt.trim(); else delete fm.excerpt }
  if (typeof featured === 'boolean') { if (featured) fm.featured = true; else delete fm.featured }
  if (typeof updateNotice === 'string') { if (updateNotice.trim()) fm.updateNotice = updateNotice.trim(); else delete fm.updateNotice }
  if (typeof editorNote === 'string') { if (editorNote.trim()) fm.editorNote = editorNote.trim(); else delete fm.editorNote }
  if (typeof reviewBy === 'string') { if (reviewBy.trim()) fm.reviewBy = reviewBy.trim(); else delete fm.reviewBy }
  if (humanized === true) fm.humanizedAt = new Date().toISOString()
  const newBody: string = typeof body === 'string' ? body : existing.content

  // Never publish a body that still carries internal "[ALLAN: …]" notes.
  if (action === 'publish') {
    const placeholders = newBody.match(/\[ALLAN:[^\]]*\]/g)
    if (placeholders && placeholders.length > 0) {
      return NextResponse.json(
        {
          error: `Can't publish — ${placeholders.length} unresolved editor note${placeholders.length === 1 ? '' : 's'} still in the body: ${placeholders.join('  ')}. Resolve ${placeholders.length === 1 ? 'it' : 'them'} first (Save Draft is fine), then publish.`,
          placeholders,
        },
        { status: 409 }
      )
    }
  }

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
    if (await dbSlugExists(target)) {
      return NextResponse.json({ error: `A post with slug "${target}" already exists` }, { status: 409 })
    }
    finalSlug = target
    renamed = true
    if (wasPublished) {
      const prev = new Set(fm.previousSlugs || [])
      prev.add(slug)
      prev.delete(finalSlug)
      fm.previousSlugs = Array.from(prev)
    }
  }

  // ── Write to the DB (rename updates the row in place → same id) ──
  const saved = renamed
    ? await dbRenamePost(slug, finalSlug, fm, newBody)
    : await dbSavePost(finalSlug, fm, newBody)

  // ── Revision log (keyed on the stable post id; no re-keying on rename) ──
  let event: RevisionEvent | null = null
  if (publishing) event = 'publish'
  else if (wasPublished) event = renamed ? 'slug_change' : 'save'
  else if (humanized === true) event = 'save' // draft humanized save → always logged
  if (event) {
    let summary: string = changeSummary || ''
    if (humanized === true && !/phrasly/i.test(summary)) {
      summary = summary ? `${summary} [Humanized via Phrasly]` : 'Humanized via Phrasly'
    }
    await writeRevision({
      postId: saved.id,
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
