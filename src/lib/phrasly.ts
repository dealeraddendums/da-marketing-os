// Phrasly humanizer for blog MDX — server-side only.
//
// Phrasly only ever sees prose: the MDX is split into blocks, and everything
// structural (headings, fences, tables, JSX/HTML, imports, frontmatter,
// images, blockquotes, horizontal rules) passes through byte-identical.
// Paragraph text and list-item text are humanized; a list item's bullet /
// number marker is stripped before sending and re-attached after.
//
// API contract (observed live 2026-11-10 against the Business API,
// https://business.phrasly.ai/api/v1/humanize):
//   - POST { "text": "..." } with header x-api-key
//   - success: 200 Content-Type text/plain, the humanized text IS the body
//   - errors:  JSON { "error": "..." } with a real status code
//       400 "Word count must be between 20 and 5,000 words."
//       401 "Invalid API key."
//   - the older api.phrasly.ai shape returns JSON on success — detected by
//     Content-Type and the humanized string is pulled from the obvious field
//   - empirically verified to SURVIVE round-trips: `⟦L1⟧`-style tokens and
//     `⟦BRK⟧` separator lines. Bold/italic markers survived a short probe but
//     were STRIPPED on a full post, so emphasis spans are tokenized whole,
//     like links / images / inline code. Survival is validated per chunk
//     (per segment) and the chunk is retried once on any mismatch.
//
// Chunking: prose units are packed in document order into chunks of at most
// ~2,500 words, joined by a ⟦BRK⟧ separator paragraph, and sent sequentially
// with a delay (Phrasly allows 5 req/s; billing is per word). A trailing
// chunk under Phrasly's 20-word minimum is merged into the previous one.
// ANY chunk failing after its retry fails the whole operation — a
// half-humanized post is never returned.

export class PhraslyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface HumanizeResult {
  body: string
  wordsSent: number
  chunks: number
}

const MIN_WORDS = 20
const MAX_WORDS = 5000
const CHUNK_TARGET_WORDS = 2500
const SEPARATOR = '⟦BRK⟧'
const REQUEST_DELAY_MS = 300 // well under the 5 req/s cap

// Brand / product terms whose spelling must survive humanizing. If Phrasly
// rewrites one (case, spacing, apostrophes), post-processing restores the
// canonical spelling.
const PROTECTED_TERMS = [
  'DealerAddendums',
  'Dealertrack',
  'Dealer General',
  'Buyers Guide',
  'CARS Rule',
  'Monroney',
  'Tekion',
  'Reynolds',
  'FTC',
  'DMS',
  'CDK',
]

type Unit =
  | { kind: 'pass'; text: string }
  | { kind: 'prose'; prefix: string; text: string }

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

// ── MDX block splitter ───────────────────────────────────────────────────────
// Line-based: emits passthrough units and prose units in document order.
// Blank lines between blocks are preserved as passthrough units.
export function splitMdx(body: string): Unit[] {
  const lines = body.split('\n')
  const units: Unit[] = []
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      units.push({ kind: 'prose', prefix: '', text: para.join('\n') })
      para = []
    }
  }
  const pass = (text: string) => {
    flushPara()
    units.push({ kind: 'pass', text })
  }

  let i = 0

  // Defensive: the editor body excludes frontmatter, but if a `---` block
  // opens the document, pass it through whole.
  if (lines[0]?.trim() === '---') {
    let j = 1
    while (j < lines.length && lines[j].trim() !== '---') j++
    if (j < lines.length) {
      pass(lines.slice(0, j + 1).join('\n'))
      i = j + 1
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    // fenced code block
    const fence = t.match(/^(```|~~~)/)
    if (fence) {
      const close = fence[1]
      let j = i + 1
      while (j < lines.length && !lines[j].trim().startsWith(close)) j++
      pass(lines.slice(i, Math.min(j + 1, lines.length)).join('\n'))
      i = j + 1
      continue
    }

    // blank line — paragraph boundary
    if (t === '') {
      pass(line)
      i++
      continue
    }

    // heading, horizontal rule, table row, import/export
    if (
      /^#{1,6}\s/.test(t) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(t) ||
      t.startsWith('|') ||
      /^(import|export)\s/.test(line)
    ) {
      pass(line)
      i++
      continue
    }

    // HTML / JSX block: consume until blank line
    if (t.startsWith('<')) {
      let j = i
      while (j < lines.length && lines[j].trim() !== '') j++
      pass(lines.slice(i, j).join('\n'))
      i = j
      continue
    }

    // blockquote: quoted text passes through verbatim (quotes shouldn't be reworded)
    if (t.startsWith('>')) {
      let j = i
      while (j < lines.length && lines[j].trim().startsWith('>')) j++
      pass(lines.slice(i, j).join('\n'))
      i = j
      continue
    }

    // image-only line
    if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(t)) {
      pass(line)
      i++
      continue
    }

    // indented code block (4+ spaces)
    if (/^ {4,}\S/.test(line) && para.length === 0) {
      pass(line)
      i++
      continue
    }

    // list item: strip the marker, humanize the text, re-attach the marker
    const li = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/)
    if (li) {
      flushPara()
      units.push({ kind: 'prose', prefix: li[1], text: li[2] })
      i++
      continue
    }

    // plain prose — accumulate into the current paragraph
    para.push(line)
    i++
  }
  flushPara()
  return units
}

// ── Inline token protection ──────────────────────────────────────────────────
// Inline code, images, and links are replaced with ⟦Ln⟧ tokens before the
// text goes to Phrasly, and restored after. All tokens must come back exactly
// once or the chunk fails validation (→ retry → hard error).
function protectInline(text: string, map: Map<string, string>): string {
  let n = map.size
  const stash = (m: string) => {
    n += 1
    const token = `⟦L${n}⟧`
    map.set(token, m)
    return token
  }
  return text
    .replace(/`[^`\n]+`/g, stash) // inline code first (may contain [ ] or ( ))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, stash) // images
    .replace(/\[[^\]]+\]\([^)]*\)/g, stash) // links
    // Bold / italic spans are tokenized WHOLE: tested live 2026-11-10 — Phrasly
    // keeps the markers on short texts but strips many on full posts (46 → 28
    // `**` markers on the ~1,000-word test draft), so the emphasized phrases
    // (usually key terms) pass through verbatim instead.
    .replace(/\*\*[^*\n]+?\*\*/g, stash)
    .replace(/__[^_\n]+?__/g, stash)
    .replace(/(?<![\w*])\*[^*\n]+?\*(?![\w*])/g, stash)
    .replace(/(?<![\w_])_[^_\n]+?_(?![\w_])/g, stash)
}

function restoreInline(text: string, map: Map<string, string>, tokens: string[]): string {
  let out = text
  for (const token of tokens) {
    const original = map.get(token)!
    out = out.split(token).join(original)
  }
  return out
}

const tokensIn = (text: string): string[] => text.match(/⟦L\d+⟧/g) || []

function tokensSurvived(sentTokens: string[], received: string): boolean {
  const got = tokensIn(received)
  if (got.length !== sentTokens.length) return false
  const want = [...sentTokens].sort()
  const have = [...got].sort()
  return want.every((t, idx) => t === have[idx])
}

// ── Protected-term restoration ───────────────────────────────────────────────
// For each protected term the INPUT contained, make sure the output carries
// the exact spelling: a case-insensitive variant (flexible spacing, optional
// apostrophes/hyphens) is rewritten back to the canonical form.
function termVariantRegex(term: string): RegExp {
  const pattern = term
    .split('')
    .map(ch => {
      if (ch === ' ') return "[\\s-]+"
      if (/[a-z0-9]/i.test(ch)) return `${ch}['’]?`
      return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`(?<![A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, 'gi')
}

export function restoreProtectedTerms(input: string, output: string): string {
  let out = output
  for (const term of PROTECTED_TERMS) {
    if (!input.includes(term)) continue
    out = out.replace(termVariantRegex(term), term)
  }
  return out
}

// ── Phrasly call ─────────────────────────────────────────────────────────────
let loggedShape = false

async function callPhrasly(text: string): Promise<string> {
  const url = process.env.PHRASLY_API_URL
  const key = process.env.PHRASLY_API_KEY
  if (!url || !key) {
    throw new PhraslyError(503, 'Phrasly is not configured — set PHRASLY_API_URL and PHRASLY_API_KEY.')
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  const raw = await res.text()
  if (!loggedShape) {
    console.log(`[phrasly] first response: status=${res.status} content-type=${ct.split(';')[0]}`)
    loggedShape = true
  }
  if (!res.ok) {
    let msg = raw.slice(0, 300)
    try {
      const j = JSON.parse(raw)
      if (typeof j.error === 'string') msg = j.error
    } catch {}
    throw new PhraslyError(res.status, msg)
  }
  if (ct.includes('application/json')) {
    // Older api.phrasly.ai shape — find the humanized string in the obvious field.
    try {
      const j = JSON.parse(raw)
      console.log('[phrasly] JSON success shape, keys:', Object.keys(j).join(','))
      const out =
        j.output ?? j.text ?? j.humanized ?? j.result ?? j.content ??
        (typeof j.data === 'string' ? j.data : j.data?.text ?? j.data?.output)
      if (typeof out === 'string' && out.trim()) return out
      throw new PhraslyError(502, 'Unrecognized JSON success shape from Phrasly — see server logs.')
    } catch (e) {
      if (e instanceof PhraslyError) throw e
      throw new PhraslyError(502, 'Phrasly returned unparseable JSON.')
    }
  }
  // Business API: the humanized text IS the body (text/plain).
  return raw
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Main entry ───────────────────────────────────────────────────────────────
export async function humanizeMarkdown(mdx: string): Promise<HumanizeResult> {
  const units = splitMdx(mdx)
  const tokenMap = new Map<string, string>()

  // Protect inline syntax inside every prose unit. A unit that is nearly all
  // protected syntax (e.g. a standalone "**Addendum software fits when:**"
  // line tokenizes to a single ⟦Ln⟧) has nothing for Phrasly to rewrite —
  // it passes through unchanged instead of being sent.
  const prose: Array<{ unitIdx: number; sendText: string; words: number }> = []
  units.forEach((u, idx) => {
    if (u.kind !== 'prose') return
    const sendText = protectInline(u.text, tokenMap)
    const words = countWords(sendText)
    const realWords = countWords(sendText.replace(/⟦L\d+⟧/g, ' '))
    if (realWords < 3) return
    prose.push({ unitIdx: idx, sendText, words })
  })

  const totalWords = prose.reduce((s, p) => s + p.words, 0)
  if (totalWords < MIN_WORDS) {
    throw new PhraslyError(400, `Not enough prose to humanize — Phrasly needs at least ${MIN_WORDS} words of paragraph/list text (found ${totalWords}).`)
  }
  const tooBig = prose.find(p => p.words > MAX_WORDS)
  if (tooBig) {
    throw new PhraslyError(400, `One paragraph is over Phrasly's ${MAX_WORDS}-word per-request limit — split it first.`)
  }

  // Pack prose units, in order, into chunks of ≤ CHUNK_TARGET_WORDS.
  const chunks: Array<typeof prose> = []
  let current: typeof prose = []
  let currentWords = 0
  for (const p of prose) {
    if (current.length && currentWords + p.words > CHUNK_TARGET_WORDS) {
      chunks.push(current)
      current = []
      currentWords = 0
    }
    current.push(p)
    currentWords += p.words
  }
  if (current.length) {
    // A trailing chunk under the 20-word minimum rides with the previous one.
    if (currentWords < MIN_WORDS && chunks.length) {
      chunks[chunks.length - 1].push(...current)
    } else {
      chunks.push(current)
    }
  }

  // Per-segment sanity (all observed live 2026-11-10):
  //  - each segment must carry exactly its own tokens (a token drifting
  //    across a ⟦BRK⟧ boundary would corrupt restore)
  //  - no invented ⟦…⟧ content (Phrasly imitated the bracket style once,
  //    emitting a fabricated "⟦TO BE SOLD⟧")
  //  - length sanity: Phrasly once expanded a 20-word transition paragraph
  //    into a ~120-word fabricated questionnaire — reject wild expansion or
  //    collapse of any segment
  const segmentProblem = (part: string, sendText: string): string | null => {
    const expected = tokensIn(sendText)
    if (!tokensSurvived(expected, part)) return 'tokens lost or moved'
    let stripped = part
    for (const t of expected) stripped = stripped.split(t).join(' ')
    if (/[⟦⟧]/.test(stripped)) return 'invented ⟦…⟧ content'
    const inW = countWords(sendText)
    const outW = countWords(part)
    if (outW > inW * 2.5 + 30) return `expanded ${inW}→${outW} words (fabrication guard)`
    if (outW < Math.max(1, Math.ceil(inW * 0.25))) return `collapsed ${inW}→${outW} words`
    return null
  }

  // Send sequentially; validate separators + per-segment sanity; a bad chunk
  // is retried (Phrasly is nondeterministic) and still-bad fails the whole
  // operation — a half-humanized or fabricated post is never returned.
  const MAX_ATTEMPTS = 3
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]
    const sendText = chunk.map(p => p.sendText).join(`\n\n${SEPARATOR}\n\n`)
    console.log(`[phrasly] chunk ${c + 1}/${chunks.length}: ${chunk.reduce((s, p) => s + p.words, 0)} words, ${chunk.length} segment(s)`)

    let parts: string[] | null = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (c > 0 || attempt > 1) await sleep(REQUEST_DELAY_MS)
      const received = await callPhrasly(sendText)
      const split = received.split(new RegExp(`\\s*⟦\\s*BRK\\s*⟧\\s*`, 'g'))
      let problem: string | null =
        split.length !== chunk.length ? `got ${split.length}/${chunk.length} segments` : null
      if (!problem) {
        for (let idx = 0; idx < split.length; idx++) {
          const p = segmentProblem(split[idx], chunk[idx].sendText)
          if (p) { problem = `segment ${idx + 1}: ${p}`; break }
        }
      }
      if (!problem) {
        parts = split
        break
      }
      console.warn(`[phrasly] chunk ${c + 1} attempt ${attempt}/${MAX_ATTEMPTS}: ${problem}${attempt < MAX_ATTEMPTS ? ' — retrying' : ''}`)
    }
    if (!parts) {
      throw new PhraslyError(502, `Phrasly kept corrupting chunk ${c + 1} of ${chunks.length} (${MAX_ATTEMPTS} attempts) — the post was NOT changed. Try again, or humanize after trimming unusual formatting in that section.`)
    }

    // Write the humanized text back into its units.
    chunk.forEach((p, idx) => {
      const unit = units[p.unitIdx] as Extract<Unit, { kind: 'prose' }>
      let text = parts![idx].trim()
      // Restore protected-term spellings BEFORE links come back, so the
      // variant regex can never rewrite inside a URL (it did, in testing:
      // "/blog/…-vs-buyers-guide" became "…-vs-Buyers Guide").
      text = restoreProtectedTerms(p.sendText, text)
      text = restoreInline(text, tokenMap, tokensIn(p.sendText))
      // List items must stay single-line so the re-attached marker holds.
      if (unit.prefix) text = text.replace(/\s*\n\s*/g, ' ')
      unit.text = text
    })
  }

  // Reassemble in original order.
  const body = units
    .map(u => (u.kind === 'pass' ? u.text : u.prefix + u.text))
    .join('\n')

  return { body, wordsSent: totalWords, chunks: chunks.length }
}
