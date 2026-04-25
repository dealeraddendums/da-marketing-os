import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { slug, mdx } = await req.json()

    if (!slug || !mdx) {
      return NextResponse.json({ error: 'slug and mdx are required' }, { status: 400 })
    }

    // Sanitize slug
    const safeSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (!safeSlug) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
    }

    const postsDir = join(process.cwd(), 'content', 'posts')
    mkdirSync(postsDir, { recursive: true })

    const filename = `${safeSlug}.mdx`
    const filepath = join(postsDir, filename)
    writeFileSync(filepath, mdx, 'utf-8')

    return NextResponse.json({
      ok: true,
      path: `/content/posts/${filename}`,
      url: `/blog/${safeSlug}`,
    })
  } catch (e) {
    console.error('blog-save error:', e)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
