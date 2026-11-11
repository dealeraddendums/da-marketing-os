import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, type BlogFrontmatter } from '@/lib/blog'
import { dbSavePost } from '@/lib/blog-store'
import { writeRevision } from '@/lib/blog-revisions'

export const dynamic = 'force-dynamic'

// Restore an archived post → DRAFT (re-review + re-publish from the Blog Queue).
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

  const post = await getPost(slug, true)
  if (!post) return NextResponse.json({ error: `No post "${slug}"` }, { status: 404 })
  if (post.status !== 'archived') {
    return NextResponse.json({ error: 'Post is not archived' }, { status: 409 })
  }

  const reason = post.frontmatter.archivedReason
  const fm: BlogFrontmatter = { ...post.frontmatter }
  fm.status = 'draft'
  delete fm.archivedAt
  delete fm.archivedReason
  delete fm.archiveRedirectSlug

  const saved = await dbSavePost(slug, fm, post.content)

  await writeRevision({
    postId: saved.id,
    event: 'restore',
    frontmatter: fm,
    body: post.content,
    changeSummary: `Restored to draft (was archived: ${reason || 'no reason recorded'})`,
  })

  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')

  return NextResponse.json({ ok: true, slug, status: 'draft' })
}
