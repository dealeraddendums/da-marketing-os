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
  funnel: { sessions: number; engaged: number; pricingViews: number; signups: number }
}

export async function fetchGa4Summary(startDate: string, endDate: string): Promise<Ga4Summary> {
  const dateRanges = [{ startDate, endDate }]

  const [totals, channels, sources, newVsReturning, pageViews] = await Promise.all([
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

  return {
    sessions, totalUsers, newUsers, returningUsers, engagedSessions,
    engagementRate, conversions,
    channels: (channels.rows ?? []).map(r => ({
      channel: r.dimensionValues?.[0]?.value ?? '(none)',
      sessions: num(r.metricValues?.[0]?.value),
      users: num(r.metricValues?.[1]?.value),
    })),
    sources: (sources.rows ?? []).map(r => ({
      source: r.dimensionValues?.[0]?.value ?? '(direct)',
      sessions: num(r.metricValues?.[0]?.value),
    })),
    // signups is filled by the caller from marketing_leads — GA4 only knows
    // about a signup if a conversion event is configured for it, and the
    // first-party lead table is the authoritative count either way.
    funnel: { sessions, engaged: engagedSessions, pricingViews, signups: 0 },
  }
}
