// Google Ads — REPORTING ONLY (Phase 1).
//
// This module intentionally exposes no mutate/create/update surface. Ads writes
// are Phase 2 and land behind the proposed_changes approval queue; there is no
// code path here that can spend money, even once the developer token arrives.
//
// Requires the developer token, which Google approves separately from OAuth. If
// it is absent, callers surface "awaiting Google Ads API token" rather than
// erroring — see adsConfigured in config.ts.

import { getAccessToken } from './oauth'
import { googleEnv, normalizeCustomerId } from './config'

const API_VERSION = 'v18'
const BASE = `https://googleads.googleapis.com/${API_VERSION}`

interface GaqlResponse { results?: Record<string, any>[]; nextPageToken?: string; error?: { message: string } }

/** Run a GAQL query. `search` (not `searchStream`) so pagination is ordinary
 *  JSON rather than a chunked stream we would have to reassemble by hand. */
async function gaql(q: string): Promise<Record<string, any>[]> {
  const token = await getAccessToken()
  const customerId = normalizeCustomerId(googleEnv.adsCustomerId)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': googleEnv.adsDeveloperToken,
    'Content-Type': 'application/json',
  }
  // Required when the OAuth user reaches the spending account through a manager
  // (MCC) account; omitted for a directly-owned account.
  const login = normalizeCustomerId(googleEnv.adsLoginCustomerId)
  if (login) headers['login-customer-id'] = login

  const out: Record<string, any>[] = []
  let pageToken: string | undefined
  do {
    const res = await fetch(`${BASE}/customers/${customerId}/googleAds:search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: q, pageSize: 1000, ...(pageToken ? { pageToken } : {}) }),
      cache: 'no-store',
    })
    const json = (await res.json()) as GaqlResponse
    if (!res.ok) throw new Error(json.error?.message || `Google Ads ${res.status}`)
    out.push(...(json.results ?? []))
    pageToken = json.nextPageToken
  } while (pageToken)
  return out
}

// Ads reports money in micros (1,000,000 micros = 1 unit of account currency).
const micros = (v: unknown) => Number(v ?? 0) / 1_000_000
const int = (v: unknown) => Number(v ?? 0)

export interface AdsCampaign {
  id: string; name: string; status: string; channel: string
  cost: number; impressions: number; clicks: number; ctr: number
  conversions: number; cpa: number; averageCpc: number
}
export interface AdsKeyword {
  campaign: string; adGroup: string; keyword: string; matchType: string
  cost: number; impressions: number; clicks: number; ctr: number; conversions: number
}
export interface AdsSummary {
  account: { cost: number; impressions: number; clicks: number; ctr: number; conversions: number; cpa: number }
  campaigns: AdsCampaign[]
  adGroups: { campaign: string; adGroup: string; status: string; cost: number; clicks: number; conversions: number }[]
  keywords: AdsKeyword[]
}

export async function fetchAdsSummary(startDate: string, endDate: string): Promise<AdsSummary> {
  const during = `segments.date BETWEEN '${startDate}' AND '${endDate}'`

  const [campaignRows, adGroupRows, keywordRows] = await Promise.all([
    gaql(`SELECT campaign.id, campaign.name, campaign.status,
                 campaign.advertising_channel_type,
                 metrics.cost_micros, metrics.impressions, metrics.clicks,
                 metrics.ctr, metrics.conversions, metrics.average_cpc
          FROM campaign WHERE ${during}`),
    gaql(`SELECT campaign.name, ad_group.name, ad_group.status,
                 metrics.cost_micros, metrics.clicks, metrics.conversions
          FROM ad_group WHERE ${during}`),
    gaql(`SELECT campaign.name, ad_group.name,
                 ad_group_criterion.keyword.text,
                 ad_group_criterion.keyword.match_type,
                 metrics.cost_micros, metrics.impressions, metrics.clicks,
                 metrics.ctr, metrics.conversions
          FROM keyword_view WHERE ${during}
          ORDER BY metrics.cost_micros DESC LIMIT 100`),
  ])

  const campaigns: AdsCampaign[] = campaignRows.map(r => {
    const cost = micros(r.metrics?.costMicros)
    const conversions = Number(r.metrics?.conversions ?? 0)
    return {
      id: String(r.campaign?.id ?? ''),
      name: r.campaign?.name ?? '',
      status: r.campaign?.status ?? '',
      channel: r.campaign?.advertisingChannelType ?? '',
      cost,
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      ctr: Number(r.metrics?.ctr ?? 0),
      conversions,
      cpa: conversions > 0 ? cost / conversions : 0,
      averageCpc: micros(r.metrics?.averageCpc),
    }
  })

  const account = campaigns.reduce(
    (a, c) => ({
      cost: a.cost + c.cost,
      impressions: a.impressions + c.impressions,
      clicks: a.clicks + c.clicks,
      conversions: a.conversions + c.conversions,
      ctr: 0, cpa: 0,
    }),
    { cost: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpa: 0 },
  )
  // Recompute the ratios from account totals — averaging per-campaign CTR/CPA
  // would weight a 10-impression campaign the same as a 100,000-impression one.
  account.ctr = account.impressions > 0 ? account.clicks / account.impressions : 0
  account.cpa = account.conversions > 0 ? account.cost / account.conversions : 0

  return {
    account,
    campaigns: campaigns.sort((a, b) => b.cost - a.cost),
    adGroups: adGroupRows.map(r => ({
      campaign: r.campaign?.name ?? '',
      adGroup: r.adGroup?.name ?? '',
      status: r.adGroup?.status ?? '',
      cost: micros(r.metrics?.costMicros),
      clicks: int(r.metrics?.clicks),
      conversions: Number(r.metrics?.conversions ?? 0),
    })),
    keywords: keywordRows.map(r => ({
      campaign: r.campaign?.name ?? '',
      adGroup: r.adGroup?.name ?? '',
      keyword: r.adGroupCriterion?.keyword?.text ?? '',
      matchType: r.adGroupCriterion?.keyword?.matchType ?? '',
      cost: micros(r.metrics?.costMicros),
      impressions: int(r.metrics?.impressions),
      clicks: int(r.metrics?.clicks),
      ctr: Number(r.metrics?.ctr ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
    })),
  }
}
