import { NextRequest, NextResponse } from 'next/server'
import { generateText, parseJSON } from '@/lib/ai'

export const dynamic = 'force-dynamic'

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

export async function POST(req: NextRequest) {
  const { topic, keywords = [], mode = 'outline' } = await req.json()

  if (!topic) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }

  // ── Full MDX post generation ──────────────────────────────────────────────
  if (mode === 'full') {
    const today = new Date().toISOString().split('T')[0]
    const kwList = keywords.length ? keywords.join(', ') : topic

    const prompt = `You are a senior content marketer for DealerAddendums.com, a B2B SaaS platform that helps car dealerships print vehicle addendums, FTC Buyers Guides, and CPO Info Sheets.

Write a complete, publication-ready blog post in MDX format for the topic: "${topic}"
Target keywords: ${kwList}

Requirements:
- 800-1,100 words of body content
- Authoritative, practical advice that real car dealers will bookmark
- Naturally mention DealerAddendums as a solution (2-3 times max, not spammy)
- Internal links: use [anchor text](/lp/kia-dealers), [anchor text](/lp/ford-dealers), or [anchor text](/lp/used-car-dealers) where relevant
- End with a CTA section (## Ready to Save Time on Your Addendums?) that links to the /#signup free trial form
- Use H2 and H3 headings only (no H1 — that comes from frontmatter title)
- No filler content — every paragraph must be useful to a real dealer

Output ONLY valid MDX. No code fences. No explanation. Start immediately with the frontmatter:

---
title: "SEO-optimized title here"
date: "${today}"
author: "Allan Tone"
excerpt: "150-char meta description"
tags: ["tag1", "tag2", "tag3"]
metaDescription: "150-char meta description"
---

Then the body content immediately after.`

    try {
      const mdx = await generateText(prompt, 3000)
      const titleMatch = mdx.match(/title:\s*["']?(.+?)["']?\s*\n/)
      const title = titleMatch?.[1]?.replace(/^["']|["']$/g, '') || topic
      const slug = toSlug(title)
      return NextResponse.json({ mdx, slug, title })
    } catch (e) {
      console.error('blog-generate full error:', e)
      return NextResponse.json({ error: 'Full post generation failed' }, { status: 500 })
    }
  }

  // ── Outline generation (default) ──────────────────────────────────────────
  const prompt = `You are an expert content marketer for DealerAddendums.com, a SaaS platform for car dealerships to manage vehicle addendums and compliance documents.

Write a high-quality, SEO-optimized blog post outline for: "${topic}"
${keywords.length ? `Target keywords: ${keywords.join(', ')}` : ''}

The post should be authoritative, helpful to car dealers, and naturally mention DealerAddendums.com as a solution.

Respond ONLY with JSON (no markdown, no code fences):
{
  "title": "SEO-optimized title",
  "metaDescription": "150 char meta description",
  "estimatedReadTime": "X min read",
  "outline": [
    { "heading": "H2 heading", "summary": "2-sentence summary of this section" }
  ],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "cta": "Closing CTA sentence linking to free trial"
}`

  try {
    const text = await generateText(prompt, 1000)
    const result = parseJSON<{
      title: string
      metaDescription: string
      estimatedReadTime: string
      outline: Array<{ heading: string; summary: string }>
      keywords: string[]
      cta: string
    }>(text)

    if (!result?.title) {
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 500 })
    }

    return NextResponse.json({ ...result, slug: toSlug(result.title) })
  } catch (e) {
    console.error('blog-generate error:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
