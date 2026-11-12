// Derive FAQPage items from a post's own structure — used only when the post
// has no explicit `faq` frontmatter. Deterministic and conservative: a post
// counts as having a Q&A section only when at least TWO H2/H3 headings are
// phrased as questions, so a lone rhetorical heading never forces an FAQPage.

import type { BlogFaqItem } from './blog'

/** Markdown → plain-ish text for an FAQPage answer (Google accepts simple
 *  HTML, but plain text is safest and reads fine in rich results). */
function stripMd(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')          // code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')    // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')  // links → text
    .replace(/^[>\-*+]\s+/gm, '')             // blockquote/list markers
    .replace(/[*_`#]+/g, '')                  // emphasis / stray heading marks
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Scan the rendered body for question-phrased H2/H3 headings and take the
 * content up to the next heading as the answer. Returns [] when fewer than
 * two real Q&A pairs exist — callers emit no FAQPage in that case.
 */
export function deriveFaqFromBody(markdown: string): BlogFaqItem[] {
  const text = markdown || ''
  const headingRe = /^(#{2,3})\s+(.+?)\s*$/gm
  const headings: { level: number; text: string; start: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(text)) !== null) {
    headings.push({ level: m[1].length, text: m[2].trim(), start: m.index, end: m.index + m[0].length })
  }

  const items: BlogFaqItem[] = []
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    if (!h.text.endsWith('?')) continue
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].start : text.length
    const answer = stripMd(text.slice(h.end, bodyEnd)).slice(0, 700)
    if (answer.length < 40) continue // a heading with no real answer under it
    items.push({ q: stripMd(h.text), a: answer })
  }
  return items.length >= 2 ? items : []
}
