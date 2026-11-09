import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getAllPosts } from '@/lib/blog'

export const dynamic = 'force-dynamic'

// Admin-only: the Blog Queue's post list, drafts included.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const posts = getAllPosts({ includeDrafts: true }).map(p => ({
    slug: p.slug,
    title: p.frontmatter.title,
    date: p.frontmatter.date,
    status: p.draft ? 'draft' : 'published',
    featured: !!p.frontmatter.featured,
    url: `/blog/${p.slug}`,
  }))
  return NextResponse.json({ posts })
}
