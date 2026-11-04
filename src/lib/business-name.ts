// Smart title-casing for dealership / business names typed into the signup
// form — the FALLBACK cleanup when the Places lookup has no match ("five star
// ford" → "Five Star Ford", "smith cdjr of macon" → "Smith CDJR of Macon").
// When Places does match, its listing name wins and this never runs on it.

/** Automotive (and business) tokens that are always written UPPERCASE. */
const UPPER = new Set([
  // franchise-combo shorthands
  'CDJR', 'CJDR', 'CDJRF', 'CDJ', 'CJD', 'JLR',
  // makes / marques styled as caps
  'GMC', 'BMW', 'VW', 'RAM', 'MINI', 'INFINITI', 'SRT', 'AMG', 'EV',
  // service-provider / misc
  'PDR', 'PPF', 'RV', 'ATV', 'UTV', 'USA', 'LLC', 'II', 'III', 'IV',
])

/** Connector words kept lowercase unless they lead the name. */
const LOWER = new Set(['of', 'and', 'the', 'at', 'on', 'in', 'by', 'for'])

function caseWord(raw: string, isFirst: boolean): string {
  if (!raw) return raw
  const upper = raw.toUpperCase()
  if (UPPER.has(upper)) return upper
  const lower = raw.toLowerCase()
  if (!isFirst && LOWER.has(lower)) return lower
  // Hyphenated ("tuttle-click") and apostrophe ("o'brien") parts each get a cap.
  return lower
    .split('-')
    .map(part =>
      part
        .split("'")
        .map((seg, i) => (i === 0 || seg.length > 1 ? cap(seg) : seg))
        .join("'"),
    )
    .join('-')
}

function cap(seg: string): string {
  if (!seg) return seg
  // "mcdonald" → "McDonald"
  if (/^mc[a-z]/.test(seg)) return 'Mc' + seg.charAt(2).toUpperCase() + seg.slice(3)
  return seg.charAt(0).toUpperCase() + seg.slice(1)
}

/**
 * Title-case a business name, preserving automotive acronyms and lowercasing
 * connectors. A name the user typed with DELIBERATE mixed case ("deLuca Ford")
 * is returned untouched — only all-lowercase / all-uppercase input is restyled.
 */
export function smartTitleCase(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return name
  const letters = name.replace(/[^a-zA-Z]/g, '')
  const allLower = letters === letters.toLowerCase()
  const allUpper = letters === letters.toUpperCase()
  if (!allLower && !allUpper) return name
  return name
    .split(' ')
    .map((w, i) => caseWord(w, i === 0))
    .join(' ')
}
