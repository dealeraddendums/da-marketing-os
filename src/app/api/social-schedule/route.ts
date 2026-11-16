import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { generateText } from '@/lib/ai'
import { getPost } from '@/lib/blog'
import { dbInsertSocialPost, dbLiveSocialPostsFor } from '@/lib/social-store'

export const dynamic = 'force-dynamic'

// Generate a LinkedIn post for a PUBLISHED blog post into the approval queue.
// Admin-gated (same gate as /api/blog-generate — this endpoint spends model
// tokens and was previously open). LinkedIn-only as of 2026-11-12 — the
// channel is hard-coded; this route can never produce a twitter/facebook row.
// Rows are born 'pending' — nothing posts without an explicit Approve in the
// Social Queue, and the publisher only ever reads 'approved' rows.

const LINKEDIN_MAX_TOKENS = 400

/** Writing instructions for LinkedIn's voice. The link is NOT part of the
 *  prompt — it is stored on the row's url column (UTMs never at the model's
 *  mercy) and becomes the LinkedIn article card at publish time. */
const linkedinPrompt = (title: string, excerpt: string) =>
  `You are a social media manager for DealerAddendums.com, a B2B SaaS platform for car dealerships.

Blog post: "${title}"
Excerpt: "${excerpt}"

Write ONE LinkedIn post promoting this blog post to dealer principals and F&I managers.
- 2-3 sentences, professional but not stiff.
- Open with a hook: a concrete pain point, stat, or insight — never "We're excited to share".
- No superlatives ("the only", "#1", "the best"). No competitor names. No hashtag spam (at most 2 hashtags, or none).
- Do NOT include any URL or "link in comments" line — the blog link is attached automatically as a LinkedIn link card.

Respond with ONLY the post text. No quotes, no preamble, no explanation.`

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { slug?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const slug = (body.slug || '').trim()
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })

  // Server-side gate: only PUBLISHED posts get social promotion. A draft's URL
  // is a noindex preview — promoting it would send followers to an unpublished
  // page.
  const post = await getPost(slug, true)
  if (!post) return NextResponse.json({ error: `No blog post "${slug}"` }, { status: 404 })
  if (post.status !== 'published') {
    return NextResponse.json(
      { error: `"${post.frontmatter.title}" is ${post.status} — publish it first; social posts are only generated for published posts.` },
      { status: 409 },
    )
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'
  const title = post.frontmatter.title
  const excerpt = post.frontmatter.metaDescription || post.frontmatter.excerpt || ''

  // Duplicate guard: one live (pending/approved) LinkedIn post per blog post.
  // Reject or publish the existing one to regenerate.
  const live = await dbLiveSocialPostsFor(slug, 'linkedin')
  if (live.length) {
    return NextResponse.json({
      created: [],
      skipped: [{ platform: 'linkedin', reason: `a ${live[0].status} linkedin post for this blog post is already in the queue` }],
    })
  }

  const text = (await generateText(linkedinPrompt(title, excerpt), LINKEDIN_MAX_TOKENS)).trim()
  if (!text) {
    return NextResponse.json({ created: [], skipped: [{ platform: 'linkedin', reason: 'AI returned empty text' }] })
  }

  // The URL is stored on its own column ONLY — never pasted into the post
  // text. At publish time it rides in the rest/posts article content block,
  // which is what makes LinkedIn render a link card; a raw URL in the
  // commentary would render as plain text beside a second link.
  const url = `${siteUrl}/blog/${slug}?utm_source=linkedin&utm_medium=social&utm_campaign=${encodeURIComponent(slug)}`
  const row = await dbInsertSocialPost({
    content: text,
    post_slug: slug,
    url,
    scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  return NextResponse.json({ created: [row], skipped: [] })
}
