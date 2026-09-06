// Search Console — Search Analytics API, over plain REST.
// Works on OAuth alone (no developer token).

import { getAccessToken } from './oauth'
import { googleEnv } from './config'

const BASE = 'https://searchconsole.googleapis.com/webmasters/v3'

interface SaRow { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }
interface SaResponse { rows?: SaRow[]; error?: { message: string } }

async function query(body: Record<string, unknown>): Promise<SaRow[]> {
  const token = await getAccessToken()
  // The site URL is a path segment and can be a domain property
  // ("sc-domain:example.com") or a URL prefix ("https://example.com/") — both
  // contain characters that must be encoded or the request 404s.
  const site = encodeURIComponent(googleEnv.gscSiteUrl)
  const res = await fetch(`${BASE}/sites/${site}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await res.json()) as SaResponse
  if (!res.ok) throw new Error(json.error?.message || `Search Console ${res.status}`)
  return json.rows ?? []
}

export interface GscSummary {
  totals: { clicks: number; impressions: number; ctr: number; position: number }
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[]
  pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[]
  trend: { date: string; clicks: number; impressions: number; position: number }[]
}

export async function fetchGscSummary(startDate: string, endDate: string): Promise<GscSummary> {
  const [totalRows, queryRows, pageRows, dateRows] = await Promise.all([
    query({ startDate, endDate, dimensions: [] }),
    query({ startDate, endDate, dimensions: ['query'], rowLimit: 25 }),
    query({ startDate, endDate, dimensions: ['page'], rowLimit: 25 }),
    query({ startDate, endDate, dimensions: ['date'], rowLimit: 500 }),
  ])

  const t = totalRows[0]
  return {
    totals: {
      clicks: t?.clicks ?? 0,
      impressions: t?.impressions ?? 0,
      ctr: t?.ctr ?? 0,
      position: t?.position ?? 0,
    },
    queries: queryRows.map(r => ({
      query: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0, position: r.position ?? 0,
    })),
    pages: pageRows.map(r => ({
      page: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0, position: r.position ?? 0,
    })),
    trend: dateRows
      .map(r => ({
        date: r.keys?.[0] ?? '', clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0, position: r.position ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}
