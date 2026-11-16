import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost } from '@/lib/blog'
import {
  ACTIVE_PLATFORMS,
  dbGetSocialPost,
  dbLastLinkedinPublishedAt,
  dbListSocialPosts,
  dbUpdateSocialPost,
  type SocialPostRow,
} from '@/lib/social-store'
import { getLinkedinStatus } from '@/lib/linkedin/oauth'
import { linkedinEnv } from '@/lib/linkedin/config'
import { composePostPayload, publishToLinkedin, type PostPayload } from '@/lib/linkedin/posts'

export const dynamic = 'force-dynamic'

// The Social Queue (admin-gated — it exposes unpublished copy):
//   GET   → every queued post + the LinkedIn connection status for the badge.
//   PATCH → { id, action: 'approve' | 'reject' | 'edit', content? }.
//
// APPROVE IS THE POSTING MOMENT (since migration 028): a LinkedIn post is
// published via rest/posts the instant it is approved — there is no cron, no
// background publisher, no other path to LinkedIn. While
// LINKEDIN_POSTING_ENABLED=false, Approve composes the exact rest/posts
// payload and returns it as a dry-run instead of calling LinkedIn; the row
// still moves to 'approved' so flipping the flag later only needs a "Post to
// LinkedIn" click (approve again), never an automatic send.
//
// approve is accepted from: pending (first approval), approved (post a row
// approved during dry-run / while disconnected), failed (retry). Success →
// 'published' + post_urn + permalink; a LinkedIn error → 'failed' + post_error
// (both visible in the admin).

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const posts = await dbListSocialPosts()
  const linkedin = await getLinkedinStatus()
  const approvedPending = posts.filter(p => p.status === 'approved').length
  // When the last LinkedIn post actually went out — the admin's 24h pacing
  // soft guard (warn before posting, never block). Computed from the rows
  // already in hand; rows with no platform count as LinkedIn.
  const lastPublishedAt = posts
    .filter(p => (p.platform || 'linkedin') === 'linkedin' && p.status === 'published' && p.published_at)
    .map(p => p.published_at as string)
    .sort()
    .pop() || null
  return NextResponse.json({
    posts,
    count: posts.length,
    posting: { ...linkedin, approvedPending, platforms: ACTIVE_PLATFORMS, lastPublishedAt },
  })
}

/** Compose the rest/posts payload for a queued row — shared by the real
 *  publish and the dry-run so what the admin sees IS what would be sent. */
async function payloadFor(row: SocialPostRow, memberUrn: string): Promise<PostPayload> {
  // Article title/description for the link card, best-effort from the blog post.
  let title: string | null = null
  let description: string | null = null
  try {
    const post = await getPost(row.post_slug, true)
    if (post) {
      title = post.frontmatter.title || null
      description = post.frontmatter.metaDescription || post.frontmatter.excerpt || null
    }
  } catch { /* the card still renders from the URL alone */ }
  return composePostPayload({ memberUrn, content: row.content, url: row.url, title, description })
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
    if (!['pending', 'approved', 'failed'].includes(row.status)) {
      return NextResponse.json({ error: `A ${row.status} post cannot be approved` }, { status: 409 })
    }

    // A row with no channel set is a LinkedIn row (LinkedIn-only since
    // 2026-11-12). Legacy twitter/facebook drafts: approval is just the
    // status flip — no posting integration exists for them.
    const platform = row.platform || 'linkedin'
    if (platform !== 'linkedin') {
      return NextResponse.json({
        post: await dbUpdateSocialPost(id, { status: 'approved' }),
        warning: `${platform} has no posting integration — approved only. The queue is LinkedIn-only as of 2026-11-12; Reject this row.`,
      })
    }

    const linkedin = await getLinkedinStatus()

    // Dry-run: posting disabled by env. Compose and SHOW, send nothing.
    if (!linkedinEnv.postingEnabled) {
      const payload = await payloadFor(row, linkedin.memberUrn || 'urn:li:person:(connect-to-resolve)')
      const post = row.status === 'pending' ? await dbUpdateSocialPost(id, { status: 'approved' }) : row
      return NextResponse.json({
        post,
        dryRun: {
          endpoint: 'POST https://api.linkedin.com/rest/posts',
          note: 'LINKEDIN_POSTING_ENABLED=false — payload composed, NOTHING was sent to LinkedIn.',
          payload,
        },
      })
    }

    // Posting enabled but no usable connection: approve, tell the operator.
    if (!linkedin.connected) {
      const post = row.status === 'pending' ? await dbUpdateSocialPost(id, { status: 'approved' }) : row
      return NextResponse.json({
        post,
        warning: 'Approved, but LinkedIn is not connected — click Connect LinkedIn, then "Post to LinkedIn" on this row.',
      })
    }

    // Soft pacing guard: note (never block) when another LinkedIn post went
    // out in the last 24h. Checked before the publish so the warning reflects
    // the post that was already live, not this one.
    let pacingWarning: string | null = null
    try {
      const lastAt = await dbLastLinkedinPublishedAt()
      if (lastAt && Date.now() - new Date(lastAt).getTime() < 24 * 60 * 60 * 1000) {
        const hours = Math.max(1, Math.round((Date.now() - new Date(lastAt).getTime()) / 3600000))
        pacingWarning = `Posted — note: another LinkedIn post went out ${hours}h ago (within 24h).`
      }
    } catch { /* the guard is advisory — never let it break posting */ }

    // The real thing. Failure is recorded on the row (visible in admin) and
    // returned as publishError — the row lands on 'failed' and offers Retry.
    try {
      const payload = await payloadFor(row, linkedin.memberUrn!)
      const { urn, permalink } = await publishToLinkedin(payload)
      const post = await dbUpdateSocialPost(id, {
        status: 'published',
        published_at: new Date().toISOString(),
        post_urn: urn,
        permalink,
        post_error: null,
      })
      return NextResponse.json(pacingWarning ? { post, warning: pacingWarning } : { post })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'publish failed'
      console.error(`[social-queue] LinkedIn publish failed for ${id}: ${message}`)
      const post = await dbUpdateSocialPost(id, { status: 'failed', post_error: message })
      return NextResponse.json({ post, publishError: message })
    }
  }

  if (action === 'reject') {
    return NextResponse.json({ post: await dbUpdateSocialPost(id, { status: 'rejected' }) })
  }
  if (action === 'edit') {
    const text = (content || '').trim()
    if (!text) return NextResponse.json({ error: 'content is required for edit' }, { status: 400 })
    // An edit to an approved/failed post sends it back to pending — what was
    // approved is no longer what would be posted.
    const patch = (row.status === 'approved' || row.status === 'failed')
      ? { content: text, status: 'pending' as const, post_error: null }
      : { content: text }
    return NextResponse.json({ post: await dbUpdateSocialPost(id, patch) })
  }
  return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
}
