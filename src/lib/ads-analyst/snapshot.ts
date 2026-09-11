// Deep Ads snapshot — the input the Ads analyst reasons over, for ONE account.
//
// Read-only, assembled from lib/google/ads.ts. Much heavier than the
// cross-channel Analyst's snapshot because the questions are different: finding
// wasted spend needs the actual search terms, and drafting an ad needs the
// actual current ad copy.
//
// ── Size discipline ────────────────────────────────────────────────────────
// The DA account returns 2,740 keyword rows and 514 search terms for 30 days,
// nearly all of them zero-impression rows in long-abandoned legacy campaigns.
// Sending that is both expensive and actively harmful — the signal drowns. So
// everything is filtered to rows with real activity, sorted by the dimension
// that matters (cost for waste, clicks for opportunity), and capped. Counts of
// what was dropped are reported so the model knows it is seeing a slice.

import {
  adGroupReport, keywordReport, searchTermReport, adReport,
  recommendationReport, changeEventReport, autoApplyEvidence,
  campaignReport, customerInfo,
  type AdGroupRow, type KeywordRow, type SearchTermRow, type AdRow,
  type RecommendationRow, type ChangeEventRow,
} from '@/lib/google/ads'

const CAP = {
  campaigns: 25,
  adGroups: 30,
  keywords: 60,
  searchTerms: 90,
  ads: 25,
  changeEvents: 60,
} as const

const money = (n: number) => Math.round((n ?? 0) * 100) / 100
const ratio = (n: number) => Math.round((n ?? 0) * 10000) / 10000

export interface AdsSnapshot {
  meta: {
    generatedAt: string
    customerId: string
    customerName: string
    currency: string
    dateRange: { startDate: string; endDate: string; days: number }
    approxTokens: number
    dropped: Record<string, number>
    errors: { source: string; error: string }[]
  }
  business: string
  account: {
    impressions: number; clicks: number; ctr: number
    averageCpc: number; cost: number; conversions: number
  }
  campaigns: { id: string; name: string; status: string; channel: string
    impressions: number; clicks: number; ctr: number
    averageCpc: number; cost: number; conversions: number }[]
  adGroups: AdGroupRow[]
  keywords: KeywordRow[]
  searchTerms: SearchTermRow[]
  ads: (Omit<AdRow, 'finalUrls'> & { finalUrl: string | null })[]
  recommendations: RecommendationRow[]
  /** Who has been changing this account, including changes we did not make. */
  changeHistory: {
    total: number
    byClientType: Record<string, number>
    byUser: Record<string, number>
    autoApply: ReturnType<typeof autoApplyEvidence>
    recent: ChangeEventRow[]
  }
  measurement: { notes: string[] }
}

function roughTokens(v: unknown): number {
  return Math.round(JSON.stringify(v).length / 4)
}

export async function buildAdsSnapshot(
  customerId: string, startDate: string, endDate: string,
  loginCustomerId?: string, days = 30,
): Promise<AdsSnapshot> {
  const errors: { source: string; error: string }[] = []
  const dropped: Record<string, number> = {}
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const login = loginCustomerId || undefined

  // Every source is independent: one failing must not lose the rest, and the
  // model is told what is missing rather than reasoning over a silent hole.
  const safe = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn() } catch (e) { errors.push({ source: name, error: msg(e) }); return fallback }
  }

  const [info, campaigns, adGroups, keywords, searchTerms, ads, recs, changes] = await Promise.all([
    safe('customer', () => customerInfo(customerId, login), null),
    safe('campaigns', () => campaignReport(customerId, startDate, endDate, login), null),
    safe('ad_groups', () => adGroupReport(customerId, startDate, endDate, login), [] as AdGroupRow[]),
    safe('keywords', () => keywordReport(customerId, startDate, endDate, login), [] as KeywordRow[]),
    safe('search_terms', () => searchTermReport(customerId, startDate, endDate, login), [] as SearchTermRow[]),
    safe('ads', () => adReport(customerId, startDate, endDate, login), [] as AdRow[]),
    safe('recommendations', () => recommendationReport(customerId, login), [] as RecommendationRow[]),
    safe('change_events', () => changeEventReport(customerId, startDate, endDate, login), [] as ChangeEventRow[]),
  ])

  // ── Trim to what an analyst would actually look at ────────────────────────
  const activeAdGroups = adGroups.filter(g => g.impressions > 0)
  dropped.adGroupsZeroImpression = adGroups.length - activeAdGroups.length
  const keptAdGroups = activeAdGroups.sort((a, b) => b.cost - a.cost).slice(0, CAP.adGroups)
  dropped.adGroupsOverCap = Math.max(activeAdGroups.length - keptAdGroups.length, 0)

  const activeKeywords = keywords.filter(k => k.impressions > 0)
  dropped.keywordsZeroImpression = keywords.length - activeKeywords.length
  const keptKeywords = activeKeywords
    .sort((a, b) => b.cost - a.cost || b.impressions - a.impressions)
    .slice(0, CAP.keywords)
  dropped.keywordsOverCap = Math.max(activeKeywords.length - keptKeywords.length, 0)

  // Search terms are where waste hides, so this is the most generous cap and
  // the sort is by cost: a term that spent money without converting is the
  // whole point of the negative-keyword exercise.
  const activeTerms = searchTerms.filter(t => t.impressions > 0)
  dropped.searchTermsZeroImpression = searchTerms.length - activeTerms.length
  const keptTerms = activeTerms
    .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, CAP.searchTerms)
  dropped.searchTermsOverCap = Math.max(activeTerms.length - keptTerms.length, 0)

  // Ads: everything currently ENABLED (so uncovered ad groups are visible even
  // at zero traffic) plus anything that served. Legacy paused ads are noise.
  const relevantAds = ads.filter(a => a.status === 'ENABLED' || a.impressions > 0)
  dropped.adsIrrelevant = ads.length - relevantAds.length
  const keptAds = relevantAds
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, CAP.ads)
    .map(a => ({ ...a, finalUrl: a.finalUrls?.[0] ?? null, finalUrls: undefined as never }))
  dropped.adsOverCap = Math.max(relevantAds.length - keptAds.length, 0)

  const keptCampaigns = (campaigns?.rows ?? [])
    .filter(c => c.impressions > 0 || c.status === 'ENABLED')
    .slice(0, CAP.campaigns)

  // ── Change authorship ─────────────────────────────────────────────────────
  const byClientType: Record<string, number> = {}
  const byUser: Record<string, number> = {}
  for (const e of changes) {
    byClientType[e.clientType] = (byClientType[e.clientType] ?? 0) + 1
    byUser[e.userEmail || '(none)'] = (byUser[e.userEmail || '(none)'] ?? 0) + 1
  }
  const auto = autoApplyEvidence(changes)

  // ── Measurement context ───────────────────────────────────────────────────
  // Without this the model will reason about cost-per-conversion as though the
  // conversion number means what it says. It does not yet.
  const notes: string[] = [
    'The Google Ads conversion action counting most conversions here is ' +
    '"AW Sign-up Form Submission" — a GTM-fired webpage tag on the `signup_completed` ' +
    'dataLayer event, which fires at FORM SUBMIT, before email confirmation. It ' +
    'therefore counts unconfirmed submissions, including bot signups. It is NOT a ' +
    'count of trial signups.',
    'A GA4 `trial_signup` event that fires at email confirmation (the real signup ' +
    'moment) was instrumented on 2026-09-11 and is only days old. There is not yet ' +
    'enough history to optimise against it, and it is not yet a GA4 key event.',
    'First-party truth for the 30 days to 2026-09-11: 38 leads submitted, 8 confirmed; ' +
    'of 16 leads carrying a gclid, 3 are confirmed. Treat Ads conversion counts as ' +
    'cost-per-form-submission, roughly 2x optimistic versus cost per confirmed trial.',
  ]
  if (auto.active) {
    notes.push(
      `Google's Recommendations AUTO-APPLY is active on this account: ${auto.count} ` +
      `change(s) in this window (${JSON.stringify(auto.operations)}), most recently ` +
      `${auto.lastAt}. Google is changing the account without human approval.`,
    )
  }
  if (errors.length) {
    notes.push(`Sources that failed and are absent: ${errors.map(e => `${e.source} (${e.error})`).join('; ')}.`)
  }

  const acct = campaigns?.totals ?? {
    impressions: 0, clicks: 0, ctr: 0, averageCpc: 0, cost: 0, conversions: 0,
  }

  const snapshot: AdsSnapshot = {
    meta: {
      generatedAt: new Date().toISOString(),
      customerId,
      customerName: info?.name ?? customerId,
      currency: info?.currency ?? 'USD',
      dateRange: { startDate, endDate, days },
      approxTokens: 0,
      dropped,
      errors,
    },
    business:
      'DealerAddendums — B2B SaaS selling addendum and window-label printing software to ' +
      'franchise car dealerships (~2,100 dealership clients). The ONLY conversion that ' +
      'matters is a dealer starting a free trial and confirming their email. Buyers are ' +
      'dealership General Managers, General Sales Managers and dealer principals: a small, ' +
      'high-value, non-impulse B2B audience. Value props: FTC Buyer\'s Guide compliance, ' +
      'printing compliant window labels and addendums in seconds, DMS/inventory-feed ' +
      'integration, and consistency across rooftops. Landing page: https://www.dealeraddendums.com/',
    account: {
      impressions: acct.impressions, clicks: acct.clicks, ctr: ratio(acct.ctr),
      averageCpc: money(acct.averageCpc), cost: money(acct.cost),
      conversions: money(acct.conversions),
    },
    campaigns: keptCampaigns.map(c => ({
      // The id is carried because a campaign-level negative keyword needs the
      // campaign RESOURCE NAME, which is built from it.
      id: c.id, name: c.name, status: c.status, channel: c.channel,
      impressions: c.impressions, clicks: c.clicks, ctr: ratio(c.ctr),
      averageCpc: money(c.averageCpc), cost: money(c.cost), conversions: money(c.conversions),
    })),
    adGroups: keptAdGroups.map(g => ({
      ...g, ctr: ratio(g.ctr), averageCpc: money(g.averageCpc),
      cost: money(g.cost), conversions: money(g.conversions),
    })),
    keywords: keptKeywords.map(k => ({
      ...k, ctr: ratio(k.ctr), averageCpc: money(k.averageCpc),
      cost: money(k.cost), conversions: money(k.conversions),
    })),
    searchTerms: keptTerms.map(t => ({
      ...t, ctr: ratio(t.ctr), cost: money(t.cost), conversions: money(t.conversions),
    })),
    ads: keptAds.map(a => ({
      ...a, ctr: ratio(a.ctr), cost: money(a.cost), conversions: money(a.conversions),
    })),
    recommendations: recs,
    changeHistory: {
      total: changes.length,
      byClientType, byUser, autoApply: auto,
      recent: changes.slice(0, CAP.changeEvents),
    },
    measurement: { notes },
  }

  snapshot.meta.approxTokens = roughTokens(snapshot)
  return snapshot
}
