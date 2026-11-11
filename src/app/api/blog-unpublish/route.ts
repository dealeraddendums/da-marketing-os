import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, type BlogFrontmatter } from '@/lib/blog'
import { dbSavePost } from '@/lib/blog-store'
import { writeRevision } from '@/lib/blog-revisions'
import { notifyUrlDeleted } from '@/lib/google/indexing'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Unpublish: published → draft (back to the draft workbench, out of
// index/sitemap/footer). Distinct from Archive (retire with reason + 410/301).
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

  const post = await getPost(slug, true)
  if (!post) return NextResponse.json({ error: `No post "${slug}"` }, { status: 404 })
  if (post.status !== 'published') {
    return NextResponse.json({ error: 'Only a published post can be unpublished' }, { status: 409 })
  }

  const fm: BlogFrontmatter = { ...post.frontmatter, status: 'draft' }
  const saved = await dbSavePost(slug, fm, post.content)

  await writeRevision({
    postId: saved.id,
    event: 'unpublish',
    frontmatter: fm,
    body: post.content,
    changeSummary: 'Unpublished (back to draft)',
  })

  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
  revalidatePath('/')

  const indexing = await notifyUrlDeleted(`${SITE_URL}/blog/${slug}`)

  return NextResponse.json({ ok: true, slug, status: 'draft', indexing })
}
