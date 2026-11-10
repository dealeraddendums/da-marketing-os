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

Write a complete blog post DRAFT in MDX format for the topic: "${topic}"
Target keywords: ${kwList}

Style rules (strict):
- 1,200-1,800 words of body content, ~8th-grade reading level
- Short, declarative sentences. Define every industry term the first time it appears.
- No superlatives: never "the only", "#1", "the best". No competitor names used disparagingly.
- Include at least three concrete specifics (a real example, a rule citation, a number). If you do not have a verified fact, write [ALLAN: describe what fact is needed] instead of inventing one.
- Authoritative, practical advice that real car dealers will bookmark
- Naturally mention DealerAddendums as a solution (2-3 times max, not spammy)
- Internal links: link to the homepage (/) and the free trial form (/#signup) at least once each; use [anchor text](/lp/kia-dealers), [anchor text](/lp/ford-dealers), or [anchor text](/lp/used-car-dealers) where relevant
- End with a short FAQ section (## Frequently Asked Questions) of 3-4 Q&As, then a CTA section (## Ready to Save Time on Your Addendums?) that links to the /#signup free trial form
- Use H2 and H3 headings only (no H1 — that comes from frontmatter title)
- Do NOT write an "About DealerAddendums" boilerplate — the site appends one automatically
- No filler content — every paragraph must be useful to a real dealer

Output ONLY valid MDX. No code fences. No explanation. Start immediately with the frontmatter (status stays "draft" — a human publishes from the Blog Queue):

---
title: "SEO-optimized title here (60 chars or less)"
date: "${today}"
author: "Allan Tone"
excerpt: "155-char meta description"
tags: ["tag1", "tag2", "tag3"]
metaDescription: "155-char meta description"
status: "draft"
faq:
  - q: "Question matching the FAQ section"
    a: "Plain-text answer, 1-3 sentences"
---

The faq frontmatter must mirror the Q&As in the FAQ section (it becomes FAQPage JSON-LD). Then the body content immediately after.`

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
    const text = await generateText(prompt, 2048)
    const result = parseJSON<{
      title: string
      metaDescription: string
      estimatedReadTime: string
      outline: Array<{ heading: string; summary: string }>
      keywords: string[]
      cta: string
    }>(text)

    if (!result?.title) {
      console.error(
        `blog-generate outline: could not parse JSON from model output (len=${text.length}). ` +
          `Head: ${JSON.stringify(text.slice(0, 200))}`,
      )
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 500 })
    }

    return NextResponse.json({ ...result, slug: toSlug(result.title) })
  } catch (e) {
    console.error('blog-generate error:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
