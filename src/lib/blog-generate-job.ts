// Background jobs for AI blog generation — the same 202 + background + poll
// pattern the AI Visibility runner uses. A full post takes 30–150s of model
// time; holding the HTTP request open that long is what made the generator
// look "hung" (a spinner with no progress, state lost on a tab switch, and a
// stalled upstream connection pinning the request until nginx's 600s). The
// POST now returns a job id immediately, the model call runs in-process
// (single PM2 fork — the same assumption lib/ai-visibility/run.ts makes), and
// the dashboard polls GET /api/blog-generate?id= for the result.
//
// Jobs are in-memory on purpose: they live minutes, the real artifact (a gap
// job's draft) is persisted in blog_posts, and a restart mid-job is reported
// to the poller as "job not found — start again".

import { generateTextFull, parseJSON } from './ai'

export type BlogJobKind = 'outline' | 'full' | 'gap'
export type BlogJobStatus = 'running' | 'done' | 'error'

export interface BlogJob {
  id: string
  kind: BlogJobKind
  status: BlogJobStatus
  startedAt: number
  finishedAt?: number
  result?: unknown
  error?: string
}

const JOB_TTL_MS = 30 * 60 * 1000
const jobs = new Map<string, BlogJob>()

function gc() {
  const now = Date.now()
  jobs.forEach((job, id) => {
    if (job.status !== 'running' && now - (job.finishedAt || job.startedAt) > JOB_TTL_MS) jobs.delete(id)
  })
}

export function startBlogJob(kind: BlogJobKind, work: () => Promise<unknown>): BlogJob {
  gc()
  const job: BlogJob = {
    id: `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    status: 'running',
    startedAt: Date.now(),
  }
  jobs.set(job.id, job)
  work()
    .then(result => {
      job.status = 'done'
      job.result = result
      job.finishedAt = Date.now()
    })
    .catch(e => {
      job.status = 'error'
      job.error = e instanceof Error ? e.message : String(e)
      job.finishedAt = Date.now()
      console.error(`[blog-generate] ${kind} job ${job.id} failed:`, job.error)
    })
  return job
}

export function getBlogJob(id: string): BlogJob | null {
  gc()
  return jobs.get(id) || null
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/** Shared editorial rules — the full generator and the gap generator must not
 *  drift apart on compliance-critical wording. */
export const BLOG_STYLE_RULES = `Style rules (strict):
- ~8th-grade reading level. Short, declarative sentences. Define every industry term the first time it appears.
- No superlatives: never "the only", "#1", "the best". No competitor names used disparagingly — in fact, do not name competitors at all.
- CARS distinction (critical): the California CARS Act (Senate Bill 766, Chapter 354, Statutes of 2025 — state law, signed Oct 6 2025, operative Oct 1 2026, covering licensed California dealers on light-duty vehicles under 10,000 lbs) and the FTC CARS Rule (federal, 16 CFR Part 463, vacated by the Fifth Circuit in January 2025 and formally withdrawn in 2026) are DIFFERENT laws. The California Act is modeled on the vacated federal Rule. Never present one as the other, and never cite the federal CARS Rule as current, pending, or enforceable law.
- Include concrete specifics (a real example, a rule citation, a number). If you do not have a verified fact, write [ALLAN: describe what fact is needed] instead of inventing one.
- Use H2 and H3 headings only (no H1 — that comes from the frontmatter title).
- Do NOT write an "About DealerAddendums" boilerplate — the site appends one automatically.
- No filler content — every paragraph must be useful to a real dealer.`

// ── Outline ───────────────────────────────────────────────────────────────────

export interface OutlineResult {
  title: string
  metaDescription: string
  estimatedReadTime: string
  outline: Array<{ heading: string; summary: string }>
  keywords: string[]
  cta: string
  slug: string
}

export async function runOutlineGeneration(topic: string, keywords: string[] = []): Promise<OutlineResult> {
  const prompt = `You are an expert content marketer for DealerAddendums.com, a SaaS platform for car dealerships to manage vehicle addendums and compliance documents.

Write a high-quality, SEO-optimized blog post outline for: "${topic}"
${keywords.length ? `Target keywords: ${keywords.join(', ')}` : ''}

The post should be authoritative, helpful to car dealers, and naturally mention DealerAddendums.com as a solution.
If the topic touches CARS, keep the California CARS Act (SB 766 — state law, operative Oct 1 2026) distinct from the FTC CARS Rule (federal, vacated January 2025); never conflate them or cite the federal Rule as current law.

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

  const { text, truncated } = await generateTextFull(prompt, 2048)
  const result = parseJSON<Omit<OutlineResult, 'slug'>>(text)
  if (!result?.title) {
    console.error(
      `blog-generate outline: could not parse JSON from model output (len=${text.length}, truncated=${truncated}). ` +
        `Head: ${JSON.stringify(text.slice(0, 200))}`,
    )
    throw new Error(truncated ? 'AI output was truncated — try again' : 'AI returned unexpected format')
  }
  return { ...result, slug: toSlug(result.title) }
}

// ── Full post ─────────────────────────────────────────────────────────────────

export interface FullPostResult {
  mdx: string
  slug: string
  title: string
}

export async function runFullPostGeneration(topic: string, keywords: string[] = []): Promise<FullPostResult> {
  const today = new Date().toISOString().split('T')[0]
  const kwList = keywords.length ? keywords.join(', ') : topic

  const prompt = `You are a senior content marketer for DealerAddendums.com, a B2B SaaS platform that helps car dealerships print vehicle addendums, FTC Buyers Guides, and CPO Info Sheets.

Write a complete blog post DRAFT in MDX format for the topic: "${topic}"
Target keywords: ${kwList}

${BLOG_STYLE_RULES}
- 1,200-1,800 words of body content
- Authoritative, practical advice that real car dealers will bookmark
- Naturally mention DealerAddendums as a solution (2-3 times max, not spammy)
- Internal links: link to the homepage (/) and the free trial form (/#signup) at least once each; use [anchor text](/lp/kia-dealers), [anchor text](/lp/ford-dealers), or [anchor text](/lp/used-car-dealers) where relevant
- End with a short FAQ section (## Frequently Asked Questions) of 3-4 Q&As, then a CTA section (## Ready to Save Time on Your Addendums?) that links to the /#signup free trial form

Output ONLY valid MDX. No code fences. No explanation. Start immediately with the frontmatter (status stays "draft" — a human publishes from the Blog Queue):

---
title: "SEO-optimized title here (60 chars or less)"
date: "${today}"
author: "Allan Tone"
excerpt: "155-char meta description"
tags: ["tag1", "tag2", "tag3"]
metaDescription: "155-char meta description"
cta: "One-sentence closing call to action pointing readers to the free trial"
status: "draft"
faq:
  - q: "Question matching the FAQ section"
    a: "Plain-text answer, 1-3 sentences"
---

The faq frontmatter must mirror the Q&As in the FAQ section (it becomes FAQPage JSON-LD). Then the body content immediately after.`

  // 8000 tokens: a 1,800-word post + frontmatter + FAQ runs well past the old
  // 3000 budget — 26 truncation warns in the prod log, drafts cut mid-sentence.
  const { text: mdx, truncated } = await generateTextFull(prompt, 8000)
  if (truncated) throw new Error('AI output was truncated at the token limit — try again')
  const titleMatch = mdx.match(/title:\s*["']?(.+?)["']?\s*\n/)
  const title = titleMatch?.[1]?.replace(/^["']|["']$/g, '') || topic
  return { mdx, slug: toSlug(title), title }
}
