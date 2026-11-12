// AI Visibility — deterministic answer parser.
//
// Pure functions, no I/O, no LLM: parsing with a model would make the metric
// itself non-reproducible (and cost money per row). Unit-tested by
// scripts/test-ai-visibility-parse.mjs, which transpiles and loads THIS file —
// the rules cannot drift away from the tests.

import type { CompetitorDef, ParsedAnswer } from './types'

/** Our own identity — matched the same way competitors are. */
const DA_NAME_PATTERNS = ['DealerAddendums', 'Dealer Addendums']
export const DA_DOMAIN = 'dealeraddendums.com'

// URLs in prose: stop at whitespace and at characters that in practice end a
// markdown/prose link rather than belong to it.
const URL_RE = /https?:\/\/[^\s<>()[\]{}"']+/g

/** Trailing punctuation a sentence contributes, not the URL itself. */
function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/, '')
}

/** Lowercased registrable host of a URL, with any leading "www." stripped.
 *  Returns null for unparseable input. Accepts bare domains too ("vauto.com"),
 *  because some engines cite a domain without a full URL. */
export function domainOf(input: string): string | null {
  const s = (input || '').trim()
  if (!s) return null
  try {
    const url = s.includes('://') ? new URL(s) : new URL(`https://${s}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    // A "domain" with no dot ("localhost", a stray word) is not a citation.
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

/** All URLs in a block of text, cleaned. */
export function urlsIn(text: string): string[] {
  const m = (text || '').match(URL_RE) || []
  return m.map(cleanUrl)
}

/** Is `host` the domain, or a subdomain of it? */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * First index of a vendor name in the answer (case-insensitive, word-boundary
 * so "CDK" never matches inside "ACDKit"). -1 when absent. Names may contain
 * spaces/&/-; the boundary check is done manually because \b misbehaves around
 * non-word characters.
 */
export function firstNameIndex(answer: string, names: string[]): number {
  const text = answer || ''
  let best = -1
  for (const name of names) {
    const n = (name || '').trim()
    if (!n) continue
    const re = new RegExp(escapeRe(n), 'ig')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const before = m.index === 0 ? '' : text[m.index - 1]
      const afterIdx = m.index + m[0].length
      const after = afterIdx >= text.length ? '' : text[afterIdx]
      const wordish = /[A-Za-z0-9]/
      if ((before && wordish.test(before)) || (after && wordish.test(after))) continue
      if (best === -1 || m.index < best) best = m.index
      break // earliest occurrence of this name found
    }
  }
  return best
}

/**
 * Parse one engine answer.
 *
 * - da_mentioned: our name anywhere in the answer, or our domain in the answer
 *   or the engine's citations.
 * - da_cited_url: the first dealeraddendums.com URL found (answer text first,
 *   then citations; a bare-domain citation yields https://dealeraddendums.com).
 * - competitors_mentioned: every ACTIVE competitor whose name/alias appears in
 *   the answer, or whose domain appears in answer URLs or citations.
 * - cited_domains: distinct domains from answer URLs + native citations, in
 *   first-seen order.
 * - position_rank: DA's 1-based rank among vendors by first appearance IN THE
 *   ANSWER TEXT (names/aliases, or a raw domain string in prose). Vendors that
 *   only appear in citations don't take part in the ordering. null when DA is
 *   not mentioned in the text at all.
 */
export function parseAnswer(
  answer: string,
  citations: string[],
  competitors: CompetitorDef[],
): ParsedAnswer {
  const text = answer || ''
  const answerUrls = urlsIn(text)
  const citationList = (citations || []).filter(Boolean)

  // ── cited_domains ──────────────────────────────────────────────────────────
  const seen: string[] = []
  const pushDomain = (d: string | null) => {
    if (d && seen.indexOf(d) === -1) seen.push(d)
  }
  for (const u of answerUrls) pushDomain(domainOf(u))
  for (const c of citationList) pushDomain(domainOf(c))

  // ── DA ─────────────────────────────────────────────────────────────────────
  const daNameIdx = firstNameIndex(text, DA_NAME_PATTERNS)
  const daDomainInText = text.toLowerCase().indexOf(DA_DOMAIN)
  const daInCitations = seen.some(d => hostMatches(d, DA_DOMAIN))
  const da_mentioned = daNameIdx !== -1 || daDomainInText !== -1 || daInCitations

  let da_cited_url: string | null = null
  for (const u of answerUrls) {
    const d = domainOf(u)
    if (d && hostMatches(d, DA_DOMAIN)) { da_cited_url = u; break }
  }
  if (!da_cited_url) {
    for (const c of citationList) {
      const d = domainOf(c)
      if (d && hostMatches(d, DA_DOMAIN)) {
        da_cited_url = c.includes('://') ? cleanUrl(c) : `https://${d}`
        break
      }
    }
  }

  // ── Competitors ────────────────────────────────────────────────────────────
  // For each active competitor: earliest text position (name/alias/domain in
  // prose), plus a mentioned flag that citations can also set.
  const textLower = text.toLowerCase()
  const competitors_mentioned: string[] = []
  const vendorPositions: { name: string; idx: number }[] = []

  for (const comp of competitors) {
    if (comp.active === false) continue
    const names = [comp.name].concat(comp.aliases || [])
    let idx = firstNameIndex(text, names)
    for (const dom of comp.domains || []) {
      const dIdx = textLower.indexOf((dom || '').toLowerCase())
      if (dIdx !== -1 && (idx === -1 || dIdx < idx)) idx = dIdx
    }
    const inCitations = (comp.domains || []).some(dom =>
      seen.some(d => hostMatches(d, (dom || '').toLowerCase())))
    if (idx !== -1 || inCitations) competitors_mentioned.push(comp.name)
    if (idx !== -1) vendorPositions.push({ name: comp.name, idx })
  }

  // ── position_rank ──────────────────────────────────────────────────────────
  let daTextIdx = -1
  if (daNameIdx !== -1) daTextIdx = daNameIdx
  if (daDomainInText !== -1 && (daTextIdx === -1 || daDomainInText < daTextIdx)) {
    daTextIdx = daDomainInText
  }
  let position_rank: number | null = null
  if (daTextIdx !== -1) {
    const ahead = vendorPositions.filter(v => v.idx < daTextIdx).length
    position_rank = ahead + 1
  }

  return { da_mentioned, da_cited_url, competitors_mentioned, cited_domains: seen, position_rank }
}
