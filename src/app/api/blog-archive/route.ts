import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync } from 'fs'
import matter from 'gray-matter'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, postFilePath, type BlogFrontmatter } from '@/lib/blog'
import { writeRevision } from '@/lib/blog-revisions'
import { notifyUrlDeleted } from '@/lib/google/indexing'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Archive a post. Requires a reason; optionally names a published replacement
// post. Consequences (all derived from status === 'archived'):
//   - gone from blog index, related posts, footer Resources, sitemap
//   - its URL 301s to the replacement, or returns 410 Gone (middleware +
//     the /blog/[slug] page fallback) — never a noindex-but-200 page
//   - URL_DELETED sent to the Indexing API
// Restore (separate route) sends it back to DRAFT for re-review, never
// straight to published.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug, reason, redirectSlug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: 'A reason is required to archive a post' }, { status: 400 })
  }

  const post = getPost(slug)
  if (!post) return NextResponse.json({ error: `No post "${slug}"` }, { status: 404 })
  if (post.status === 'archived') {
    return NextResponse.json({ error: 'Post is already archived' }, { status: 409 })
  }

  let redirect: string | undefined
  if (redirectSlug) {
    const target = getPost(redirectSlug)
    if (!target || target.status !== 'published' || target.slug === slug) {
      return NextResponse.json({ error: 'Redirect target must be a different, published post' }, { status: 400 })
    }
    redirect = target.slug
  }

  const fm: BlogFrontmatter = { ...post.frontmatter }
  fm.status = 'archived'
  fm.archivedAt = new Date().toISOString().split('T')[0]
  fm.archivedReason = String(reason).trim()
  if (redirect) fm.archiveRedirectSlug = redirect
  else delete fm.archiveRedirectSlug

  writeFileSync(postFilePath(slug)!, matter.stringify(post.content, fm), 'utf-8')

  await writeRevision({
    slug,
    event: 'archive',
    frontmatter: fm,
    body: post.content,
    changeSummary: `Archived: ${fm.archivedReason}${redirect ? ` → redirect to ${redirect}` : ' (410)'}`,
  })

  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
  revalidatePath('/')

  const indexing = await notifyUrlDeleted(`${SITE_URL}/blog/${slug}`)

  return NextResponse.json({
    ok: true,
    slug,
    archivedReason: fm.archivedReason,
    redirect: redirect || null,
    indexing,
  })
}
