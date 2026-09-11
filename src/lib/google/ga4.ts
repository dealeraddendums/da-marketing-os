// GA4 — Analytics Data API v1beta, over plain REST.
//
// Works on OAuth alone (no developer token), so this lights up the moment
// Connect Google succeeds.

import { getAccessToken } from './oauth'
import { googleEnv } from './config'

const BASE = 'https://analyticsdata.googleapis.com/v1beta'

interface RunReportRow { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }
interface RunReportResponse { rows?: RunReportRow[]; totals?: RunReportRow[]; error?: { message: string } }

async function runReport(body: Record<string, unknown>): Promise<RunReportResponse> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/properties/${googleEnv.ga4PropertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await res.json()) as RunReportResponse
  if (!res.ok) throw new Error(json.error?.message || `GA4 ${res.status}`)
  return json
}

const num = (v?: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export interface Ga4Summary {
  sessions: number
  totalUsers: number
  newUsers: number
  returningUsers: number
  engagedSessions: number
  engagementRate: number
  conversions: number
  channels: { channel: string; sessions: number; users: number }[]
  sources: { source: string; sessions: number }[]
  funnel: {
    sessions: number; engaged: number; pricingViews: number
    /** Real GA4 `trial_form_start` event count for the period (trial form only). */
    formStarts: number
    /** Real GA4 `trial_signup` event count for the period. */
    signups: number
  }
  /**
   * Raw counts for the events this app sends over the Measurement Protocol.
   * Present so the funnel can tell "instrumented, nothing yet" apart from an
   * un-instrumented step — the two used to be indistinguishable because both
   * rendered as 0.
   */
  eventCounts: Record<string, number>
  /** When these events started being sent, so the UI can date an empty state. */
  instrumentedAt: string
  /**
   * First-party lead counts for the same window, attached by the analytics
   * route. Kept beside the GA4 numbers rather than substituted for them, so
   * the panel can show GA4-counted vs. actually-happened side by side.
   */
  firstParty?: { leads: number; confirmedLeads: number }
}

/**
 * The date form_start / trial_signup began flowing to GA4 (see lib/ga4-mp.ts).
 * GA4 cannot be backfilled, so any period before this legitimately has no
 * data, and the funnel says so instead of rendering a zero that looks like
 * measured failure.
 */
export const EVENTS_INSTRUMENTED_AT = '2026-09-11'

/**
 * Event names pulled for the funnel.
 *
 * `trial_form_start` and `trial_signup` are ours, sent over the Measurement
 * Protocol. `form_start` is GA4's own ENHANCED MEASUREMENT event — it fires on
 * every form on the site (57,647 in the 30 days to 2026-09-11, against 41,460
 * sessions), so it is collected here as CONTEXT only and deliberately not used
 * as the funnel's Form Started step, which needs the trial form alone.
 */
const TRACKED_EVENTS = ['trial_form_start', 'trial_signup', 'form_start'] as const

export async function fetchGa4Summary(startDate: string, endDate: string): Promise<Ga4Summary> {
  const dateRanges = [{ startDate, endDate }]

  const [totals, channels, sources, newVsReturning, pageViews, events] = await Promise.all([
    runReport({ dateRanges, metrics: [
      { name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' },
      { name: 'engagedSessions' }, { name: 'engagementRate' }, { name: 'conversions' },
    ] }),
    runReport({ dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 }),
    runReport({ dateRanges, dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 }),
    runReport({ dateRanges, dimensions: [{ name: 'newVsReturning' }], metrics: [{ name: 'totalUsers' }] }),
    // Pricing-section interest, approximated by pageviews of any /pricing-ish
    // path. GA4 has no first-party "pricing_view" event unless one is
    // configured, so this is a proxy and is labelled as such in the UI.
    runReport({ dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }],
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'CONTAINS', value: 'pricing' } } },
      limit: 20 }),
    // Real counts for the events this app sends over the Measurement Protocol.
    // Filtered to just those names so an unrelated GA4 event cannot inflate a
    // funnel step, and so the report stays small.
    runReport({ dateRanges, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [...TRACKED_EVENTS] } } },
      limit: 20 }),
  ])

  const t = totals.rows?.[0]?.metricValues ?? []
  const sessions        = num(t[0]?.value)
  const totalUsers      = num(t[1]?.value)
  const newUsers        = num(t[2]?.value)
  const engagedSessions = num(t[3]?.value)
  const engagementRate  = num(t[4]?.value)
  const conversions     = num(t[5]?.value)

  let returningUsers = Math.max(totalUsers - newUsers, 0)
  for (const r of newVsReturning.rows ?? []) {
    if (r.dimensionValues?.[0]?.value === 'returning') returningUsers = num(r.metricValues?.[0]?.value)
  }

  const pricingViews = (pageViews.rows ?? [])
    .reduce((sum, r) => sum + num(r.metricValues?.[0]?.value), 0)

  // Default every tracked event to 0 so a name GA4 has never seen is still a
  // key in the map — the UI distinguishes "0" from "absent" via instrumentedAt,
  // not via a missing property.
  const eventCounts: Record<string, number> = {}
  for (const name of TRACKED_EVENTS) eventCounts[name] = 0
  for (const r of events.rows ?? []) {
    const name = r.dimensionValues?.[0]?.value
    if (name) eventCounts[name] = num(r.metricValues?.[0]?.value)
  }

  return {
    sessions, totalUsers, newUsers, returningUsers, engagedSessions,
    engagementRate, conversions,
    eventCounts,
    instrumentedAt: EVENTS_INSTRUMENTED_AT,
    channels: (channels.rows ?? []).map(r => ({
      channel: r.dimensionValues?.[0]?.value ?? '(none)',
      sessions: num(r.metricValues?.[0]?.value),
      users: num(r.metricValues?.[1]?.value),
    })),
    sources: (sources.rows ?? []).map(r => ({
      source: r.dimensionValues?.[0]?.value ?? '(direct)',
      sessions: num(r.metricValues?.[0]?.value),
    })),
    // Both of these are now REAL GA4 event counts rather than the hardcoded 0
    // they used to be. `trial_signup` fires server-side at email confirmation
    // and `form_start` on first interaction with the trial form — see
    // lib/ga4-mp.ts. A 0 here means "instrumented, none in this period", which
    // the funnel labels with instrumentedAt rather than presenting as measured
    // failure. The first-party lead table remains the authoritative count.
    funnel: {
      sessions, engaged: engagedSessions, pricingViews,
      // The trial form specifically — NOT GA4's site-wide enhanced-measurement
      // `form_start`, which is available in eventCounts for context.
      formStarts: eventCounts.trial_form_start ?? 0,
      signups: eventCounts.trial_signup ?? 0,
    },
  }
}
