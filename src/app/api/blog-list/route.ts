import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getAllPosts } from '@/lib/blog'

export const dynamic = 'force-dynamic'

// Admin-only: the Blog Queue's post list — drafts and archived included.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = new Date().toISOString().split('T')[0]
  const posts = (await getAllPosts({ includeDrafts: true, includeArchived: true, fresh: true })).map(p => ({
    slug: p.slug,
    title: p.frontmatter.title,
    date: p.frontmatter.date,
    updatedAt: p.frontmatter.updatedAt || null,
    status: p.status,
    featured: !!p.frontmatter.featured,
    updateNotice: p.frontmatter.updateNotice || null,
    reviewBy: p.frontmatter.reviewBy || null,
    reviewOverdue: !!(p.frontmatter.reviewBy && p.frontmatter.reviewBy <= today && p.status !== 'archived'),
    archivedReason: p.frontmatter.archivedReason || null,
    archivedAt: p.frontmatter.archivedAt || null,
    archiveRedirectSlug: p.frontmatter.archiveRedirectSlug || null,
    url: `/blog/${p.slug}`,
  }))
  return NextResponse.json({ posts })
}
