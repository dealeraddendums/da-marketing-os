import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, type BlogFrontmatter } from '@/lib/blog'
import { dbSavePost } from '@/lib/blog-store'
import { writeRevision } from '@/lib/blog-revisions'
import { notifyUrlDeleted } from '@/lib/google/indexing'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Archive a post (requires a reason; optional published replacement). Archived
// posts leave the index/related/footer/sitemap; the URL 301s to the replacement
// or returns 410. Restore (separate route) sends it back to DRAFT.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug, reason, redirectSlug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: 'A reason is required to archive a post' }, { status: 400 })
  }

  const post = await getPost(slug, true)
  if (!post) return NextResponse.json({ error: `No post "${slug}"` }, { status: 404 })
  if (post.status === 'archived') {
    return NextResponse.json({ error: 'Post is already archived' }, { status: 409 })
  }

  let redirect: string | undefined
  if (redirectSlug) {
    const target = await getPost(redirectSlug, true)
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

  const saved = await dbSavePost(slug, fm, post.content)

  await writeRevision({
    postId: saved.id,
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
