import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost, type BlogFrontmatter } from '@/lib/blog'
import { dbSavePost } from '@/lib/blog-store'
import { writeRevision } from '@/lib/blog-revisions'
import { submitUrlForIndexing } from '@/lib/google/indexing'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Admin-only publish: flip a draft to published, stamp today's date, revalidate
// blog/post/sitemap, submit to the Google Indexing API. Indexing failure never
// fails the publish.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await req.json()
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const post = await getPost(slug, true)
  if (!post) {
    return NextResponse.json({ error: `No post found for slug "${slug}"` }, { status: 404 })
  }
  if (post.status === 'archived') {
    return NextResponse.json(
      { error: 'Post is archived — restore it to draft and re-review before publishing' },
      { status: 409 }
    )
  }
  const wasDraft = post.status === 'draft'

  // Never publish a body that still has internal "[ALLAN: …]" notes.
  const placeholders = post.content.match(/\[ALLAN:[^\]]*\]/g)
  if (wasDraft && placeholders && placeholders.length > 0) {
    return NextResponse.json(
      {
        error: `Can't publish — ${placeholders.length} unresolved editor note${placeholders.length === 1 ? '' : 's'} still in the body: ${placeholders.join('  ')}. Resolve ${placeholders.length === 1 ? 'it' : 'them'} in the editor (Save Draft is fine), then publish.`,
        placeholders,
      },
      { status: 409 }
    )
  }

  const fm: BlogFrontmatter = { ...post.frontmatter }
  if (wasDraft) {
    fm.status = 'published'
    fm.date = new Date().toISOString().split('T')[0] // published_at = today
    const saved = await dbSavePost(slug, fm, post.content)
    await writeRevision({
      postId: saved.id,
      event: 'publish',
      frontmatter: fm,
      body: post.content,
      changeSummary: 'Published from the Blog Queue',
    })
  }

  revalidatePath('/blog')
  revalidatePath(`/blog/${slug}`)
  revalidatePath('/sitemap.xml')
  revalidatePath('/') // footer Resources row

  const url = `${SITE_URL}/blog/${slug}`
  const indexing = await submitUrlForIndexing(url)

  return NextResponse.json({
    ok: true,
    slug,
    url,
    alreadyPublished: !wasDraft,
    publishedAt: fm.date,
    indexing,
  })
}
