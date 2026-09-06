/** Shared date-range handling for the Google report routes.
 *  Google's APIs all take YYYY-MM-DD, so ranges are resolved once here rather
 *  than three times with three slightly different definitions of "last 30 days". */
export function resolveRange(searchParams: URLSearchParams): { startDate: string; endDate: string; days: number } {
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 365)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return { startDate: iso(start), endDate: iso(end), days }
}
