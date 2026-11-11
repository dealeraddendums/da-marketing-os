import { NextRequest, NextResponse } from 'next/server'
import matter from 'gray-matter'
import { safeSlug, type BlogFrontmatter } from '@/lib/blog'
import { dbSavePost } from '@/lib/blog-store'

export const dynamic = 'force-dynamic'

// The generator's "add to queue": takes full MDX (frontmatter + body), parses
// it, and upserts a blog_posts row. Posts are stored in the DB now (migration
// 024), not written to content/posts/.
export async function POST(req: NextRequest) {
  try {
    const { slug, mdx } = await req.json()
    if (!slug || !mdx) {
      return NextResponse.json({ error: 'slug and mdx are required' }, { status: 400 })
    }
    const s = safeSlug(slug)
    if (!s) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })

    const { data, content } = matter(mdx)
    const fm = data as BlogFrontmatter
    if (!fm.title) {
      return NextResponse.json({ error: 'mdx frontmatter must include a title' }, { status: 400 })
    }
    await dbSavePost(s, fm, content)

    return NextResponse.json({ ok: true, url: `/blog/${s}` })
  } catch (e) {
    console.error('blog-save error:', e)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
