// US phone formatting for the signup form — "(941) 600-3300" as the user
// types, fixing the "9416003300" raw-digit submissions. Display/UX only; the
// field stays optional and the formatted string is what gets stored.

/** Format a US phone progressively from whatever was typed. */
export function formatUsPhone(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  d = d.slice(0, 10)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
