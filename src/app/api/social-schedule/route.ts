import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { generateText } from '@/lib/ai'
import { getPost } from '@/lib/blog'
import {
  ACTIVE_PLATFORMS,
  dbInsertSocialPost,
  dbLiveSocialPostsFor,
  type SocialPlatform,
} from '@/lib/social-store'

export const dynamic = 'force-dynamic'

// Generate social posts for a PUBLISHED blog post into the approval queue.
// Admin-gated (same gate as /api/blog-generate — this endpoint spends model
// tokens and was previously open). One post per active platform (LinkedIn only
// today; the registry in lib/social-store.ts is where a platform comes back).
// Rows are born 'pending' — nothing posts without an explicit Approve in the
// Social Queue, and the publisher only ever reads 'approved' rows.

interface PlatformSpec {
  /** Writing instructions for this platform's voice. The link is NOT part of
   *  the prompt — it is appended deterministically so the UTM tags are never
   *  at the model's mercy. */
  prompt: (title: string, excerpt: string) => string
  maxTokens: number
}

const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
  linkedin: {
    maxTokens: 400,
    prompt: (title, excerpt) =>
      `You are a social media manager for DealerAddendums.com, a B2B SaaS platform for car dealerships.

Blog post: "${title}"
Excerpt: "${excerpt}"

Write ONE LinkedIn post promoting this blog post to dealer principals and F&I managers.
- 2-3 sentences, professional but not stiff.
- Open with a hook: a concrete pain point, stat, or insight — never "We're excited to share".
- No superlatives ("the only", "#1", "the best"). No competitor names. No hashtag spam (at most 2 hashtags, or none).
- Do NOT include any URL or "link in comments" line — the link is appended automatically.

Respond with ONLY the post text. No quotes, no preamble, no explanation.`,
  },
  // Retired from generation 2026-11-12 (LinkedIn-only decision). Re-adding a
  // platform = a spec here + ACTIVE_PLATFORMS + its posting credentials.
  twitter: { maxTokens: 300, prompt: () => { throw new Error('twitter generation is retired') } },
  facebook: { maxTokens: 300, prompt: () => { throw new Error('facebook generation is retired') } },
}

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

  const created = []
  const skipped = []
  for (const platform of ACTIVE_PLATFORMS) {
    // Duplicate guard: one live (pending/approved) post per platform per blog
    // post. Reject or publish the existing one to regenerate.
    const live = await dbLiveSocialPostsFor(slug, platform)
    if (live.length) {
      skipped.push({ platform, reason: `a ${live[0].status} ${platform} post for this blog post is already in the queue` })
      continue
    }

    const spec = PLATFORM_SPECS[platform]
    const text = (await generateText(spec.prompt(title, excerpt), spec.maxTokens)).trim()
    if (!text) {
      skipped.push({ platform, reason: 'AI returned empty text' })
      continue
    }

    const url = `${siteUrl}/blog/${slug}?utm_source=${platform}&utm_medium=social&utm_campaign=${encodeURIComponent(slug)}`
    const row = await dbInsertSocialPost({
      platform,
      content: `${text}\n\n${url}`,
      post_slug: slug,
      url,
      scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    created.push(row)
  }

  return NextResponse.json({ created, skipped })
}
