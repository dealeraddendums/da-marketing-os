import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import {
  ACTIVE_PLATFORMS,
  dbGetSocialPost,
  dbListSocialPosts,
  dbUpdateSocialPost,
  platformConnected,
} from '@/lib/social-store'

export const dynamic = 'force-dynamic'

// The Social Queue (admin-gated — it exposes unpublished copy):
//   GET   → every queued post + honest posting status: whether a posting
//           integration is actually configured, and how many approved posts
//           are waiting on it.
//   PATCH → { id, action: 'approve' | 'reject' | 'edit', content? }.
// Approve is the ONLY path to 'approved', and the publisher only reads
// 'approved' rows — queued never means "will post".

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const posts = await dbListSocialPosts()
  const connected = ACTIVE_PLATFORMS.some(p => platformConnected(p))
  const approvedPending = posts.filter(p => p.status === 'approved').length
  return NextResponse.json({
    posts,
    count: posts.length,
    posting: { connected, approvedPending, platforms: ACTIVE_PLATFORMS },
  })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; action?: string; content?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { id, action, content } = body
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })

  const row = await dbGetSocialPost(id)
  if (!row) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (row.status === 'published') {
    return NextResponse.json({ error: 'This post has already been published — it can no longer change' }, { status: 409 })
  }

  if (action === 'approve') {
    if (row.status !== 'pending') return NextResponse.json({ error: `Only a pending post can be approved (this one is ${row.status})` }, { status: 409 })
    return NextResponse.json({ post: await dbUpdateSocialPost(id, { status: 'approved' }) })
  }
  if (action === 'reject') {
    return NextResponse.json({ post: await dbUpdateSocialPost(id, { status: 'rejected' }) })
  }
  if (action === 'edit') {
    const text = (content || '').trim()
    if (!text) return NextResponse.json({ error: 'content is required for edit' }, { status: 400 })
    // An edit to an approved post sends it back to pending — what was approved
    // is no longer what would be posted.
    const patch = row.status === 'approved'
      ? { content: text, status: 'pending' as const }
      : { content: text }
    return NextResponse.json({ post: await dbUpdateSocialPost(id, patch) })
  }
  return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
}
