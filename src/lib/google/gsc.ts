// Search Console — Search Analytics API, over plain REST.
// Works on OAuth alone (no developer token, no service account).
//
// ── Why the SEO tab was 403-ing (diagnosed 2026-09-11) ─────────────────────
// The error was `User does not have sufficient permission for site
// 'https://www.dealeraddendums.com'`, which reads like a missing permission but
// was actually a WRONG PROPERTY STRING. Search Console treats the property
// identifier as opaque: a URL-prefix property and a domain property are
// different objects, and asking for one you do not own is a 403, not a 404.
//
// sites.list for this grant returns exactly one property:
//     sc-domain:dealeraddendums.com   (permissionLevel: siteOwner)
// while GSC_SITE_URL was set to the URL-prefix form `https://www.dealeraddendums.com`,
// which does not exist in the account. The domain form answers 200 with real
// data (326 clicks / 2,714 impressions over the 30 days to 2026-09-10).
//
// There is NO service account anywhere in this integration — GA4, Search
// Console and Ads all authenticate as the single OAuth user in
// google_connection. So nothing needs adding under Search Console → Users and
// permissions; the identity already owns the property.
//
// The fix is therefore not a new env value but a resolution step: ask Google
// which properties this grant actually has and use the one that matches. That
// also means the tab keeps working if the property is later changed to a URL
// prefix, or the site moves domain.

import { getAccessToken } from './oauth'
import { googleEnv } from './config'

const BASE = 'https://searchconsole.googleapis.com/webmasters/v3'

interface SaRow { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }
interface SaResponse { rows?: SaRow[]; error?: { message?: string; code?: number } }

export interface GscSite { siteUrl: string; permissionLevel: string }

/** Every property this grant can read. Cheap, and the only authoritative
 *  answer to "which property string is correct". */
export async function listSites(): Promise<GscSite[]> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/sites`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    console.error(`[google-gsc] sites.list HTTP ${res.status} — raw body follows:\n${raw}`)
    throw new Error(`Search Console sites.list failed (HTTP ${res.status}): ${raw.slice(0, 300)}`)
  }
  const json = JSON.parse(raw) as { siteEntry?: GscSite[] }
  return json.siteEntry ?? []
}

/** Properties that can actually be queried. `siteUnverifiedUser` can list a
 *  property but not read its data, so it is not a usable candidate. */
const USABLE = /^(siteOwner|siteFullUser|siteRestrictedUser)$/

/**
 * Work out which property string to query.
 *
 * Order is deliberate — an explicit, correct GSC_SITE_URL always wins, so an
 * operator can pin a specific property when several exist:
 *   1. GSC_SITE_URL, if the account actually has it.
 *   2. Its obvious variants (trailing slash added/removed, and the
 *      `sc-domain:` form of the same host) — this is what rescues the current
 *      misconfiguration without an env edit.
 *   3. The only usable property, when there is exactly one.
 * Otherwise throw with the real list, so the message names the fix.
 */
export async function resolveSite(): Promise<{ site: string; resolvedFrom: string; available: GscSite[] }> {
  const available = await listSites()
  const usable = available.filter(s => USABLE.test(s.permissionLevel))
  const configured = (googleEnv.gscSiteUrl || '').trim()

  const have = (s: string) => usable.find(u => u.siteUrl === s)

  if (configured) {
    if (have(configured)) return { site: configured, resolvedFrom: 'env', available }

    const noSlash = configured.replace(/\/+$/, '')
    const withSlash = `${noSlash}/`
    let host = ''
    try { host = new URL(noSlash).hostname.replace(/^www\./, '') } catch { /* not a URL */ }
    const variants = [
      withSlash,
      noSlash,
      ...(host ? [`sc-domain:${host}`] : []),
    ]
    for (const v of variants) {
      if (have(v)) {
        console.warn(
          `[google-gsc] GSC_SITE_URL is ${JSON.stringify(configured)}, which this account does not have; ` +
          `using ${JSON.stringify(v)} instead. Set GSC_SITE_URL=${v} to make this explicit.`,
        )
        return { site: v, resolvedFrom: 'variant-of-env', available }
      }
    }
  }

  if (usable.length === 1) {
    if (configured) {
      console.warn(
        `[google-gsc] GSC_SITE_URL ${JSON.stringify(configured)} not found; falling back to the only ` +
        `property this account has: ${JSON.stringify(usable[0].siteUrl)}.`,
      )
    }
    return { site: usable[0].siteUrl, resolvedFrom: 'only-property', available }
  }

  throw new Error(
    `No usable Search Console property${configured ? ` matching ${configured}` : ''}. ` +
    `This Google account has: ${available.map(s => `${s.siteUrl} (${s.permissionLevel})`).join(', ') || 'none'}. ` +
    'Set GSC_SITE_URL to one of those exact strings.',
  )
}

async function query(site: string, body: Record<string, unknown>): Promise<SaRow[]> {
  const token = await getAccessToken()
  // The property is a path segment and can be a domain property
  // ("sc-domain:example.com") or a URL prefix ("https://example.com/") — both
  // contain characters that must be encoded or the request 404s.
  const res = await fetch(`${BASE}/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    // Log the whole body: the 403 message names the exact property string
    // Google thinks we asked for, which is the entire diagnosis.
    console.error(`[google-gsc] searchAnalytics site=${site} HTTP ${res.status} — raw body follows:\n${raw}`)
    let parsed: SaResponse | null = null
    try { parsed = JSON.parse(raw) as SaResponse } catch { /* HTML or empty */ }
    throw new Error(parsed?.error?.message || `Search Console ${res.status}: ${raw.slice(0, 300)}`)
  }
  const json = JSON.parse(raw) as SaResponse
  return json.rows ?? []
}

export interface GscSummary {
  site: string
  resolvedFrom: string
  totals: { clicks: number; impressions: number; ctr: number; position: number }
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[]
  pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[]
  trend: { date: string; clicks: number; impressions: number; position: number }[]
}

export async function fetchGscSummary(startDate: string, endDate: string): Promise<GscSummary> {
  const { site, resolvedFrom } = await resolveSite()

  const [totalRows, queryRows, pageRows, dateRows] = await Promise.all([
    query(site, { startDate, endDate, dimensions: [] }),
    query(site, { startDate, endDate, dimensions: ['query'], rowLimit: 25 }),
    query(site, { startDate, endDate, dimensions: ['page'], rowLimit: 25 }),
    query(site, { startDate, endDate, dimensions: ['date'], rowLimit: 500 }),
  ])

  const t = totalRows[0]
  return {
    site,
    resolvedFrom,
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
