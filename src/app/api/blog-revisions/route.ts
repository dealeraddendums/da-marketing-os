import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost } from '@/lib/blog'
import { listRevisions } from '@/lib/blog-revisions'

export const dynamic = 'force-dynamic'

// Admin-only: revision history for one post. The editor's Restore button
// loads a revision's fields into the form client-side — restoring never
// publishes anything by itself.
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const slug = req.nextUrl.searchParams.get('slug') || ''
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  const post = await getPost(slug, true)
  if (!post || !post.id) return NextResponse.json({ revisions: [] })
  const revisions = await listRevisions(post.id)
  return NextResponse.json({ revisions })
}
