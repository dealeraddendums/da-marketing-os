// "Send to Blog pipeline" — generate a real, publishable-quality DRAFT for an
// AI Visibility gap, replacing the old one-line stub. The article is the
// on-domain answer to the exact dealer prompt the engines answered with
// competitors; the gap rationale (why this post, engines lost, competitors
// named, cited domains) lives in editor_note (internal, admin-editor only),
// never in the public body. Status stays 'draft' — Allan publishes by hand,
// and the [ALLAN: …] publish guard still applies to any unverified fact the
// model flags.
//
// Idempotent per gap: the draft always lands at the deterministic base slug
// (slugified prompt text), earlier stubs in the slug family (-2, -3, …) are
// archived, and a second click returns the existing generated draft instead of
// creating another.

import matter from 'gray-matter'
import { generateTextFull } from '../ai'
import { BLOG_STYLE_RULES } from '../blog-generate-job'
import { supabase } from '../supabase'
import { dbGetAllPosts, dbSavePost, rowToFrontmatter, type BlogRow } from '../blog-store'
import { writeRevision } from '../blog-revisions'
import { deriveFaqFromBody } from '../blog-faq'
import type { BlogFaqItem, BlogFrontmatter } from '../blog'
import { getRuns, getResultsForRun } from './store'

/** The marker every old stub body carries — tells a placeholder apart from a
 *  generated article. Keep in sync with nothing: stubs are no longer written. */
const STUB_MARKER = 'Draft topic created from the AI Visibility tab'

/** Same slugify the stub creator used, so the existing slug family matches. */
export function gapBaseSlug(promptText: string): string {
  return (
    promptText.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) ||
    `ai-visibility-gap-${Date.now()}`
  )
}

function familyOf(baseSlug: string, rows: BlogRow[]): BlogRow[] {
  const re = new RegExp(`^${baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?$`)
  return rows.filter(r => re.test(r.slug))
}

const isStub = (r: BlogRow) => r.body_mdx.includes(STUB_MARKER)

export interface GapArticleResult {
  slug: string
  title: string
  existing: boolean
}

/** A non-archived, already-generated draft for this gap, if one exists. */
export async function findExistingGapDraft(baseSlug: string): Promise<BlogRow | null> {
  const rows = await dbGetAllPosts(true)
  return familyOf(baseSlug, rows).find(r => r.status !== 'archived' && !isStub(r)) || null
}

interface GapContext {
  enginesLost: string[]
  competitorsNamed: string[]
  citedDomains: string[]
}

/** Server-derived gap facts from the latest run (never trusts the client). */
async function gatherGapContext(promptId: string): Promise<GapContext> {
  const ctx: GapContext = { enginesLost: [], competitorsNamed: [], citedDomains: [] }
  const runs = await getRuns(1)
  if (!runs[0]) return ctx
  const results = (await getResultsForRun(runs[0].id)).filter(r => r.prompt_id === promptId)
  const lost = results.filter(r => !r.error && !r.da_mentioned && (r.competitors_mentioned || []).length > 0)
  ctx.enginesLost = lost.map(r => r.engine)
  const domainCount: Record<string, number> = {}
  for (const r of lost) {
    for (const name of r.competitors_mentioned || []) {
      if (!ctx.competitorsNamed.includes(name)) ctx.competitorsNamed.push(name)
    }
    for (const d of r.cited_domains || []) {
      const dom = d.toLowerCase()
      if (dom.includes('dealeraddendums.com')) continue
      domainCount[dom] = (domainCount[dom] || 0) + 1
    }
  }
  ctx.citedDomains = Object.keys(domainCount).sort((a, b) => domainCount[b] - domainCount[a]).slice(0, 8)
  return ctx
}

function wordCount(md: string): number {
  return md.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`|-]/g, ' ').trim().split(/\s+/).filter(Boolean).length
}

/** Published post whose title shares the most words with the prompt. */
function pickRelated(promptText: string, published: { slug: string; title: string }[]): { slug: string; title: string } | null {
  if (!published.length) return null
  const words = new Set(promptText.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3))
  let best = published[0]
  let bestScore = -1
  for (const p of published) {
    const score = p.title.toLowerCase().split(/[^a-z0-9]+/).filter(w => words.has(w)).length
    if (score > bestScore) { best = p; bestScore = score }
  }
  return best
}

function validFaq(faq: unknown): BlogFaqItem[] | null {
  if (!Array.isArray(faq)) return null
  const items = faq.filter(
    (x): x is BlogFaqItem => !!x && typeof (x as BlogFaqItem).q === 'string' && typeof (x as BlogFaqItem).a === 'string',
  )
  return items.length >= 3 ? items.slice(0, 5) : null
}

export async function generateGapArticle(promptId: string): Promise<GapArticleResult> {
  const { data: prompt, error } = await supabase
    .from('ai_visibility_prompts')
    .select('id, prompt_text, category')
    .eq('id', promptId)
    .single()
  if (error || !prompt) throw new Error('Prompt not found')

  const baseSlug = gapBaseSlug(prompt.prompt_text)

  // Idempotency: a generated draft already exists → hand it back, change nothing.
  const existing = await findExistingGapDraft(baseSlug)
  if (existing) return { slug: existing.slug, title: existing.title, existing: true }

  const ctx = await gatherGapContext(promptId)
  const allRows = await dbGetAllPosts(true)
  const published = allRows.filter(r => r.status === 'published').map(r => ({ slug: r.slug, title: r.title }))
  const otherDraftTitles = allRows
    .filter(r => r.status === 'draft' && !familyOf(baseSlug, [r]).length && !isStub(r))
    .map(r => r.title)
    .slice(0, 12)

  const today = new Date().toISOString().split('T')[0]
  const publishedList = published.map(p => `- "${p.title}" → /blog/${p.slug}`).join('\n')

  const genPrompt = `You are a senior content marketer for DealerAddendums.com, a B2B SaaS platform that helps car dealerships print vehicle addendums, FTC Buyers Guides, and CPO Info Sheets — one platform that prints all of them.

Car dealers ask AI assistants this exact question, and we need the definitive on-domain answer to it:

"${prompt.prompt_text}"

Write a complete blog post DRAFT in MDX format that directly and completely answers that question.

Hard requirements (every one of them):
- The FIRST paragraph of the body answers the literal question directly and names DealerAddendums as the answer. No preamble, no scene-setting, no "in today's automotive landscape" — the first sentence IS the answer.
- 800-1,200 words of body content.
- Every H2 heading is phrased as the follow-up question a dealer would actually ask next (it ends with "?"). H3 headings may be used beneath them.
- End the body with a FAQ section (## Frequently Asked Questions) of 3-5 Q&As. The faq frontmatter must mirror those Q&As exactly (it becomes FAQPage JSON-LD).
- Internal links inside the body: at least one link to the free trial form written exactly as [start a free trial](/#signup), and at least one link to a related published post from this list, using the exact path shown:
${publishedList || '- (no published posts yet — skip the related-post link)'}
- Do NOT mention AI assistants, AI search engines, chatbots, competitors, "visibility", or why this post was written. The reader is a dealer with a question — nothing else exists.
${otherDraftTitles.length ? `- These drafts already exist in our queue — do not duplicate their angle; this post's angle is strictly the question above:\n${otherDraftTitles.map(t => `  - "${t}"`).join('\n')}` : ''}

${BLOG_STYLE_RULES}

Output ONLY valid MDX. No code fences. No explanation. Start immediately with the frontmatter:

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

Then the body content immediately after.`

  // Generate, with one retry on truncation / unusable output.
  let fm: BlogFrontmatter | null = null
  let body = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, truncated } = await generateTextFull(genPrompt, 6000)
    if (truncated) continue
    try {
      const parsed = matter(text.replace(/^```(?:mdx|markdown)?\n?|```\s*$/g, ''))
      const pfm = parsed.data as BlogFrontmatter
      if (pfm?.title && wordCount(parsed.content) >= 500) {
        fm = pfm
        body = parsed.content.trim()
        break
      }
      console.error(`[gap-article] attempt ${attempt}: unusable output (title=${!!pfm?.title}, words=${wordCount(parsed.content)})`)
    } catch (e) {
      console.error(`[gap-article] attempt ${attempt}: frontmatter parse failed`, e)
    }
  }
  if (!fm) throw new Error('Generation produced no usable article after 2 attempts — try again')

  // Deterministic guarantees the prompt alone can't give us.
  if (!/\(\/#signup\)/.test(body)) {
    body += `\n\nReady to see it on your own inventory? [Start a free trial](/#signup) — month-to-month, no setup fees.`
  }
  if (!/\]\(\/blog\//.test(body) && published.length) {
    const rel = pickRelated(prompt.prompt_text, published)
    if (rel) {
      const line = `\n\n**Related reading:** [${rel.title}](/blog/${rel.slug})\n`
      const faqIdx = body.indexOf('## Frequently Asked Questions')
      body = faqIdx > 0 ? body.slice(0, faqIdx) + line + '\n' + body.slice(faqIdx) : body + line
    }
  }

  // Rationale → internal editor note ONLY (the public body carries none of it).
  const rationale =
    `AI Visibility gap (${today}): dealers ask "${prompt.prompt_text}" and the engines answer with competitors. ` +
    `Engines lost: ${ctx.enginesLost.join(', ') || 'n/a'}. Competitors named: ${ctx.competitorsNamed.join(', ') || 'n/a'}. ` +
    `Top cited domains in those answers: ${ctx.citedDomains.join(', ') || 'n/a'}. ` +
    `Generated by the gap pipeline — review the facts (and any [ALLAN:] notes), then publish by hand.`

  const tags: string[] = ['ai-visibility-gap']
  if (prompt.category) tags.push(prompt.category)
  for (const t of Array.isArray(fm.tags) ? fm.tags : []) if (typeof t === 'string' && !tags.includes(t)) tags.push(t)

  const finalFm: BlogFrontmatter = {
    ...fm,
    date: today,
    status: 'draft',
    author: fm.author || 'Allan Tone',
    tags: tags.slice(0, 6),
    editorNote: rationale,
    faq: validFaq(fm.faq) || deriveFaqFromBody(body).slice(0, 5),
  }

  // The real draft lands at the BASE slug (overwriting the stub there, same row
  // id so revisions follow); every other live stub in the family is archived.
  const saved = await dbSavePost(baseSlug, finalFm, body)
  await writeRevision({
    postId: saved.id,
    event: 'save',
    frontmatter: finalFm,
    body,
    changeSummary: 'Generated from the AI Visibility gap pipeline',
  }).catch(e => console.error('[gap-article] revision write failed', e))

  const family = familyOf(baseSlug, await dbGetAllPosts(true))
  for (const row of family) {
    if (row.slug === baseSlug || row.status === 'archived' || !isStub(row)) continue
    const stubFm = rowToFrontmatter(row)
    stubFm.status = 'archived'
    stubFm.archivedAt = today
    stubFm.archivedReason = `Stub superseded by the generated gap draft at /blog/${baseSlug}`
    try {
      const archived = await dbSavePost(row.slug, stubFm, row.body_mdx)
      await writeRevision({
        postId: archived.id,
        event: 'archive',
        frontmatter: stubFm,
        body: row.body_mdx,
        changeSummary: stubFm.archivedReason,
      })
    } catch (e) {
      console.error(`[gap-article] failed to archive stub ${row.slug}`, e)
    }
  }

  return { slug: baseSlug, title: finalFm.title, existing: false }
}
