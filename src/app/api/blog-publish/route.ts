import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import matter from 'gray-matter'
import { revalidatePath } from 'next/cache'
import { isAdminRequest } from '@/lib/admin-auth'
import { postFilePath, isDraft, type BlogFrontmatter } from '@/lib/blog'
import { submitUrlForIndexing } from '@/lib/google/indexing'

export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Admin-only publish step: flip a draft post to published, stamp today's date
// as the publication date, revalidate the blog index / post / sitemap, and
// submit the URL to the Google Indexing API. An indexing failure never fails
// the publish — the post is live either way and the sitemap is the canonical
// signal; the result reports it so the operator can retry.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await req.json()
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const filePath = postFilePath(slug)
  if (!filePath) {
    return NextResponse.json({ error: `No post found for slug "${slug}"` }, { status: 404 })
  }

  const raw = readFileSync(filePath, 'utf-8')
  const parsed = matter(raw)
  const fm = parsed.data as BlogFrontmatter
  const wasDraft = isDraft(fm)

  if (wasDraft) {
    fm.status = 'published'
    fm.date = new Date().toISOString().split('T')[0] // published_at = today
    writeFileSync(filePath, matter.stringify(parsed.content, fm), 'utf-8')
  }

  // The index page, the post itself and the sitemap are all ISR — make the
  // publish visible now rather than at the next revalidation window.
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
