import { NextRequest, NextResponse } from 'next/server'
import { generateText, parseJSON } from '@/lib/ai'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface SocialPost {
  platform: 'linkedin' | 'twitter' | 'facebook'
  content: string
  scheduledFor: string
  postSlug: string
}

export async function POST(req: NextRequest) {
  try {
    const { title, excerpt, slug, url } = await req.json()

    if (!title || !slug) {
      return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'
    const postUrl = url || `${siteUrl}/blog/${slug}`

    const prompt = `You are a social media manager for DealerAddendums.com, a B2B SaaS platform for car dealers.

Blog post: "${title}"
Excerpt: "${excerpt || ''}"
URL: ${postUrl}

Write 3 social media posts — one for each platform. Each should feel native to that platform.
- LinkedIn: Professional, 2-3 sentences, targets dealer principals and F&I managers. Include a hook stat or insight.
- Twitter/X: Punchy, under 240 chars, conversational. Include the URL.
- Facebook: Friendly, 2 sentences, targets dealer staff. Ask a question to encourage comments.

Respond ONLY as a JSON array of 3 objects:
[
  { "platform": "linkedin", "content": "..." },
  { "platform": "twitter", "content": "..." },
  { "platform": "facebook", "content": "..." }
]`

    const text = await generateText(prompt, 800)
    const posts = parseJSON<{ platform: string; content: string }[]>(text)

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 500 })
    }

    // Schedule: +1d, +3d, +7d from now
    const delays = [1, 3, 7]
    const scheduled: SocialPost[] = posts.map((p, i) => ({
      platform: p.platform as SocialPost['platform'],
      content: p.content,
      scheduledFor: new Date(Date.now() + delays[i] * 24 * 60 * 60 * 1000).toISOString(),
      postSlug: slug,
    }))

    // Save to /content/social/
    const socialDir = join(process.cwd(), 'content', 'social')
    mkdirSync(socialDir, { recursive: true })
    const filename = `${slug}-${Date.now()}.json`
    writeFileSync(join(socialDir, filename), JSON.stringify(scheduled, null, 2))

    return NextResponse.json({ posts: scheduled, savedAs: filename })
  } catch (e) {
    console.error('social-schedule error:', e)
    return NextResponse.json({ error: 'Scheduling failed' }, { status: 500 })
  }
}
