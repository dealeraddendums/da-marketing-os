import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost } from '@/lib/blog'

export const dynamic = 'force-dynamic'

// Admin-only: raw post (full frontmatter + MDX body) for the editor.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const slug = req.nextUrl.searchParams.get('slug') || ''
  const post = getPost(slug)
  if (!post) return NextResponse.json({ error: `No post "${slug}"` }, { status: 404 })
  return NextResponse.json({
    slug: post.slug,
    status: post.status,
    frontmatter: post.frontmatter,
    body: post.content,
  })
}
