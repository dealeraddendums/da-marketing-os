// Google Ads — REPORTING ONLY.
//
// This module intentionally exposes no mutate/create/update surface. Ads writes
// are Phase 2 and land behind the proposed_changes approval queue; there is no
// code path here that can spend money.
//
// ── What changed 2026-09-11, and why it was broken ─────────────────────────
// Three separate faults, each independently fatal. Verified against the live
// API before and after (see CLAUDE-da-marketing-os.md → Google integration):
//
//  1. DEVELOPER TOKEN. Google retired developer tokens on 2026-09-09. Calls now
//     carry ONLY `Authorization: Bearer <token>` (plus `login-customer-id` when
//     reaching a child account through a manager). Confirmed empirically:
//     customers:listAccessibleCustomers answers 200 with no developer-token
//     header at all. The old code also gated the whole panel on the token being
//     present, so Ads could never light up no matter what Google approved.
//
//  2. API VERSION + pageSize. v18 → v25. In v25 `pageSize` is REJECTED:
//     `PAGE_SIZE_NOT_SUPPORTED — Setting the page size is not supported.
//     Search Responses will have fixed page size of '10000' rows.` The old
//     client sent `pageSize: 1000` on every call, so every query was a hard
//     400 even with correct auth. Pagination is pageToken-only now.
//
//  3. login-customer-id. The env held GOOGLE_ADS_LOGIN_CUSTOMER_ID=6947440699,
//     which this grant cannot access — so every query failed
//     USER_PERMISSION_DENIED. Both accounts actually reachable
//     (2056900150 "Dealer Addendums", 6495986391 "The Little Farm on Olga Rd")
//     are `manager: false`, so the header must be OMITTED for them. It is now
//     derived per account from the real hierarchy rather than taken on faith.

import { getAccessToken } from './oauth'
import { normalizeCustomerId } from './config'

const API_VERSION = 'v25'
const BASE = `https://googleads.googleapis.com/${API_VERSION}`

interface GaqlResponse {
  results?: Record<string, any>[]
  nextPageToken?: string
  error?: { message?: string; status?: string; details?: any[] }
}

/**
 * A Google Ads call failed in a way the operator can act on. `kind` drives
 * which message the panel renders, because the remedies are different:
 * a disabled API is a Cloud-console fix, a permission refusal is an account
 * -access fix, and an unreadable body is usually neither.
 */
export class AdsError extends Error {
  readonly kind: 'api-not-enabled' | 'permission' | 'upstream' | 'query'
  readonly status: number
  readonly requestId?: string
  constructor(
    kind: AdsError['kind'], message: string, status = 0, requestId?: string,
  ) {
    super(message)
    this.name = 'AdsError'
    this.kind = kind
    this.status = status
    this.requestId = requestId
  }
}

/** Google's "you have not switched this API on" response — a 403 carrying
 *  SERVICE_DISABLED, which is the same status a permission refusal uses, so it
 *  must be checked first or it gets mislabelled. */
function isApiDisabled(blob: string): boolean {
  return /SERVICE_DISABLED|has not been used in project|accessNotConfigured/i.test(blob)
}

function isPermission(blob: string): boolean {
  return /USER_PERMISSION_DENIED|PERMISSION_DENIED|CUSTOMER_NOT_ENABLED|NOT_ADS_USER/i.test(blob)
}

/** Pull Google's requestId out of the error envelope — it is the one thing
 *  Google support asks for, and it is buried in details[]. */
function requestIdOf(json: GaqlResponse): string | undefined {
  for (const d of json?.error?.details ?? []) {
    if (d && typeof d.requestId === 'string') return d.requestId
  }
  return undefined
}

function authHeaders(token: string, loginCustomerId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    // Bearer ONLY. No developer-token: retired by Google 2026-09-09.
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  // Sent ONLY when the account is genuinely reached through a manager. An
  // inaccessible manager id here fails every call with USER_PERMISSION_DENIED.
  const login = normalizeCustomerId(loginCustomerId || '')
  if (login) headers['login-customer-id'] = login
  return headers
}

/**
 * Run a GAQL query against one customer, following pageToken to the end.
 *
 * `search` (not `searchStream`) so pagination is ordinary JSON rather than a
 * chunked stream we would have to reassemble by hand.
 *
 * Raw error bodies are logged in full. Google's error JSON is where the actual
 * cause lives (errorCode.authorizationError, SERVICE_DISABLED, the requestId),
 * and every hour spent on this integration was an hour of not having it.
 */
async function gaql(
  customerId: string, query: string, loginCustomerId?: string,
): Promise<Record<string, any>[]> {
  const token = await getAccessToken()
  const cid = normalizeCustomerId(customerId)
  const headers = authHeaders(token, loginCustomerId)

  const out: Record<string, any>[] = []
  let pageToken: string | undefined
  let page = 0

  do {
    // NOTE: no pageSize. v25 answers PAGE_SIZE_NOT_SUPPORTED and fixes the page
    // at 10,000 rows; sending it is an outright 400.
    const body: Record<string, unknown> = { query }
    if (pageToken) body.pageToken = pageToken

    const res = await fetch(`${BASE}/customers/${cid}/googleAds:search`, {
      method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store',
    })

    // Read as TEXT first: Google can answer with an HTML error page (notably
    // when the API is not enabled on the Cloud project), and res.json() on that
    // throws `Unexpected token '<'` — which used to surface to the operator as
    // a raw parser error instead of a readable state.
    const raw = await res.text()
    let json: GaqlResponse | null = null
    try { json = JSON.parse(raw) as GaqlResponse } catch { json = null }

    if (!res.ok || !json) {
      const label = `[google-ads] customer=${cid}${headers['login-customer-id'] ? ` login=${headers['login-customer-id']}` : ''} HTTP ${res.status}`
      console.error(`${label} — raw response body follows:\n${raw}`)
      console.error(`${label} — query was: ${query.replace(/\s+/g, ' ').trim()}`)

      if (!json) {
        const looksHtml = /^\s*<(!doctype|html)/i.test(raw)
        throw new AdsError(
          looksHtml ? 'api-not-enabled' : 'upstream',
          looksHtml
            ? 'Google Ads answered with an HTML error page instead of data — usually means the Google Ads API is not enabled for this Cloud project.'
            : `Google Ads returned an unreadable response (HTTP ${res.status}).`,
          res.status,
        )
      }
      const blob = JSON.stringify(json.error ?? {})
      const reqId = requestIdOf(json)
      const message = json.error?.message || `Google Ads ${res.status}`
      // Order matters: a switched-off API answers 403 exactly like a permission
      // refusal does, so the disabled case is detected first.
      if (isApiDisabled(blob)) {
        throw new AdsError('api-not-enabled', message, res.status, reqId)
      }
      if (isPermission(blob)) {
        throw new AdsError(
          'permission',
          `${message} (customer ${cid}${headers['login-customer-id'] ? `, via manager ${headers['login-customer-id']}` : ''})`,
          res.status, reqId,
        )
      }
      throw new AdsError(res.status === 400 ? 'query' : 'upstream', message, res.status, reqId)
    }

    out.push(...(json.results ?? []))
    pageToken = json.nextPageToken
    page += 1
    // Defensive stop: a pageToken that never clears would otherwise spin here.
    if (page > 50) {
      console.warn(`[google-ads] customer=${cid} stopped paginating after ${page} pages`)
      break
    }
  } while (pageToken)

  return out
}

// ── Account discovery ───────────────────────────────────────────────────────

/**
 * Every customer id this OAuth grant can reach directly. Note these are only
 * the TOP-level entries — a manager account appears here but its children do
 * not, which is why listClientAccounts exists.
 */
export async function listAccessibleCustomers(): Promise<string[]> {
  const token = await getAccessToken()
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    console.error(`[google-ads] listAccessibleCustomers HTTP ${res.status} — raw body follows:\n${raw}`)
    let json: GaqlResponse | null = null
    try { json = JSON.parse(raw) as GaqlResponse } catch { /* HTML or empty */ }
    const blob = JSON.stringify(json?.error ?? {})
    if (!json || /^\s*<(!doctype|html)/i.test(raw)) {
      throw new AdsError('api-not-enabled',
        'Google Ads answered with an HTML error page — the Google Ads API is probably not enabled for this Cloud project.', res.status)
    }
    if (isApiDisabled(blob)) {
      throw new AdsError('api-not-enabled', json?.error?.message || 'Google Ads API is not enabled.', res.status, requestIdOf(json))
    }
    if (isPermission(blob)) {
      throw new AdsError('permission', json?.error?.message || 'No Google Ads accounts are accessible to this Google account.', res.status, requestIdOf(json))
    }
    throw new AdsError('upstream', json?.error?.message || `Google Ads ${res.status}`, res.status, requestIdOf(json))
  }
  const json = JSON.parse(raw) as { resourceNames?: string[] }
  return (json.resourceNames ?? []).map(n => n.split('/').pop() || '').filter(Boolean)
}

export interface AdsAccount {
  id: string
  name: string
  currency: string
  timeZone: string
  manager: boolean
  testAccount: boolean
  status: string
  /** Depth under the manager it was discovered through (0 = reached directly). */
  level: number
  /** The manager id to send as login-customer-id when querying this account,
   *  or null when it is reached directly. Carried with the account so callers
   *  never have to reconstruct the hierarchy. */
  viaManager: string | null
}

/** Details for one customer. `loginCustomerId` is required only when reaching
 *  it through a manager. */
export async function customerInfo(
  customerId: string, loginCustomerId?: string,
): Promise<AdsAccount | null> {
  const rows = await gaql(
    customerId,
    `SELECT customer.id, customer.descriptive_name, customer.currency_code,
            customer.time_zone, customer.manager, customer.test_account,
            customer.status
     FROM customer LIMIT 1`,
    loginCustomerId,
  )
  const c = rows[0]?.customer
  if (!c) return null
  return {
    id: String(c.id ?? normalizeCustomerId(customerId)),
    name: c.descriptiveName || `Account ${c.id}`,
    currency: c.currencyCode || 'USD',
    timeZone: c.timeZone || '',
    manager: !!c.manager,
    testAccount: !!c.testAccount,
    status: c.status || '',
    level: 0,
    viaManager: loginCustomerId ? normalizeCustomerId(loginCustomerId) : null,
  }
}

/**
 * Child accounts beneath a manager (MCC). Queried AS the manager
 * (login-customer-id = the manager), which is the only way Google will return
 * the hierarchy. Excludes the manager's own self-row, which customer_client
 * always includes at level 0.
 */
export async function listClientAccounts(managerId: string): Promise<AdsAccount[]> {
  const mgr = normalizeCustomerId(managerId)
  const rows = await gaql(
    mgr,
    `SELECT customer_client.id, customer_client.descriptive_name,
            customer_client.manager, customer_client.level,
            customer_client.status, customer_client.currency_code,
            customer_client.time_zone
     FROM customer_client
     WHERE customer_client.level <= 1`,
    mgr,
  )
  return rows
    .map(r => r.customerClient)
    .filter(c => c && String(c.id) !== mgr)
    .map(c => ({
      id: String(c.id),
      name: c.descriptiveName || `Account ${c.id}`,
      currency: c.currencyCode || 'USD',
      timeZone: c.timeZone || '',
      manager: !!c.manager,
      testAccount: false,      // customer_client does not expose test_account
      status: c.status || '',
      level: Number(c.level ?? 1),
      viaManager: mgr,
    }))
}

/**
 * The full account list for the picker: every directly accessible account, with
 * managers expanded one level into their children.
 *
 * A failure on ONE account does not fail the list — an operator with a mix of
 * live and suspended accounts should still see the ones that work, so per
 * -account errors are collected and returned alongside the successes.
 */
export async function listAdsAccounts(): Promise<{
  accounts: AdsAccount[]
  problems: { id: string; error: string }[]
}> {
  const ids = await listAccessibleCustomers()
  const accounts: AdsAccount[] = []
  const problems: { id: string; error: string }[] = []

  for (const id of ids) {
    try {
      const info = await customerInfo(id)
      if (!info) { problems.push({ id, error: 'no customer row returned' }); continue }
      accounts.push(info)
      if (info.manager) {
        try {
          const children = await listClientAccounts(id)
          accounts.push(...children)
        } catch (err) {
          problems.push({ id, error: `children: ${err instanceof Error ? err.message : String(err)}` })
        }
      }
    } catch (err) {
      problems.push({ id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // Managers first, then by name — so an MCC reads as a heading above its
  // children rather than being sorted into the middle of them.
  accounts.sort((a, b) =>
    (b.manager ? 1 : 0) - (a.manager ? 1 : 0) || a.name.localeCompare(b.name))
  return { accounts, problems }
}

// ── Campaign report ─────────────────────────────────────────────────────────

// Ads reports money in micros (1,000,000 micros = 1 unit of account currency).
const micros = (v: unknown) => Number(v ?? 0) / 1_000_000
// Metrics arrive as STRINGS ("clicks": "0") and are omitted entirely when zero,
// so every read goes through a coercion that treats absent as 0.
const int = (v: unknown) => Number(v ?? 0)

export interface CampaignRow {
  id: string
  name: string
  status: string
  channel: string
  impressions: number
  clicks: number
  ctr: number
  averageCpc: number
  cost: number
  conversions: number
}

export interface CampaignReport {
  customerId: string
  currency: string
  rows: CampaignRow[]
  totals: {
    impressions: number; clicks: number; ctr: number
    averageCpc: number; cost: number; conversions: number
  }
}

/**
 * Last-N-days campaign performance for one account.
 *
 * Ratio metrics (CTR, average CPC) are recomputed from the account totals
 * rather than summed: averaging per-campaign CTR would weight a 10-impression
 * campaign the same as a 100,000-impression one, and summing average CPC is
 * meaningless.
 */
export async function campaignReport(
  customerId: string, startDate: string, endDate: string,
  loginCustomerId?: string, currency = 'USD',
): Promise<CampaignReport> {
  const rows = await gaql(
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status,
            campaign.advertising_channel_type,
            metrics.impressions, metrics.clicks, metrics.ctr,
            metrics.average_cpc, metrics.cost_micros, metrics.conversions
     FROM campaign
     WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
    loginCustomerId,
  )

  const mapped: CampaignRow[] = rows.map(r => ({
    id: String(r.campaign?.id ?? ''),
    name: r.campaign?.name ?? '',
    status: r.campaign?.status ?? '',
    channel: r.campaign?.advertisingChannelType ?? '',
    impressions: int(r.metrics?.impressions),
    clicks: int(r.metrics?.clicks),
    ctr: Number(r.metrics?.ctr ?? 0),
    averageCpc: micros(r.metrics?.averageCpc),
    cost: micros(r.metrics?.costMicros),
    conversions: Number(r.metrics?.conversions ?? 0),
  }))

  const totals = mapped.reduce(
    (a, c) => ({
      impressions: a.impressions + c.impressions,
      clicks: a.clicks + c.clicks,
      cost: a.cost + c.cost,
      conversions: a.conversions + c.conversions,
      ctr: 0, averageCpc: 0,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, ctr: 0, averageCpc: 0 },
  )
  totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0
  totals.averageCpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0

  return {
    customerId: normalizeCustomerId(customerId),
    currency,
    // Highest spend first, then most impressions — so a report where nothing
    // has spent yet still has a sensible order instead of Google's arbitrary one.
    rows: mapped.sort((a, b) => b.cost - a.cost || b.impressions - a.impressions),
    totals,
  }
}
