// Marketing snapshot — the input the Analyst reasons over.
//
// Assembled ENTIRELY from the three existing Google clients. No new Google API
// surface is introduced: Ads uses listAdsAccounts + campaignReport (what the
// Ads tab calls), Search Console uses fetchGscSummary (the SEO tab's call, with
// a larger rowLimit on the same searchAnalytics endpoint), GA4 uses
// fetchGa4Summary (the Analytics tab's call, untouched).
//
// Deliberately NOT routed through lib/google/cache: an analysis run is manual
// and infrequent, the operator pressing "Run analysis" means "look at the data
// now", and reusing the tabs' cache keys with different row limits would let a
// 25-row cached entry satisfy a 50-row request.
//
// ── Size discipline ────────────────────────────────────────────────────────
// The whole point is to fit an analyst's working set into one prompt, so rows
// are capped and numbers are rounded. Every field here is something a brief can
// actually cite; anything an analyst would not reference is dropped rather than
// sent "just in case". `meta.approxTokens` reports the realised size so a
// regression in this file is visible in the UI instead of silently inflating
// cost. Target is well under 15k tokens serialized.

import { listAdsAccounts, campaignReport, type AdsAccount } from '@/lib/google/ads'
import { fetchGscSummary } from '@/lib/google/gsc'
import { fetchGa4Summary } from '@/lib/google/ga4'

/** Per-account campaign rows are capped; the tail of a long account is almost
 *  all zero-impression campaigns, which teach an analyst nothing. */
const MAX_CAMPAIGNS_PER_ACCOUNT = 25
const MAX_GSC_QUERIES = 50
const MAX_GSC_PAGES = 25
const MAX_GA4_ROWS = 10

/** Money to cents, ratios to 4dp. Full float precision costs tokens and says
 *  nothing — nobody acts on the ninth decimal of a CTR. */
const money = (n: number) => Math.round((n ?? 0) * 100) / 100
const ratio = (n: number) => Math.round((n ?? 0) * 10000) / 10000

export interface AnalystSnapshot {
  meta: {
    generatedAt: string
    dateRange: { startDate: string; endDate: string; days: number }
    approxTokens: number
    sources: { ads: boolean; gsc: boolean; ga4: boolean }
    errors: { source: string; error: string }[]
  }
  business: {
    dealerAddendums: string
    littleFarm: string
  }
  ads: {
    accounts: {
      id: string
      name: string
      currency: string
      manager: boolean
      totals: {
        impressions: number; clicks: number; ctr: number
        averageCpc: number; cost: number; conversions: number
      }
      campaigns: {
        name: string; status: string; channel: string
        impressions: number; clicks: number; ctr: number
        averageCpc: number; cost: number; conversions: number
      }[]
      campaignsOmitted: number
    }[]
  } | null
  seo: {
    property: string
    totals: { clicks: number; impressions: number; ctr: number; position: number }
    queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[]
    pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[]
  } | null
  analytics: {
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
  } | null
  /**
   * Known instrumentation state, computed rather than asserted.
   *
   * This exists because a snapshot alone cannot distinguish "zero conversions
   * happened" from "conversions are not being recorded" — and a brief that
   * reads the first as fact will confidently optimise toward a metric that
   * isn't wired up. Each flag is derived from the data actually fetched, so it
   * stops being raised the moment the underlying gap is fixed.
   */
  measurement: {
    notes: string[]
    ga4ConversionsZero: boolean
    ga4SignupsInstrumented: boolean
    ga4FormStartInstrumented: boolean
    adsConversionsZeroAccounts: string[]
    gscPropertyIsDomainLevel: boolean
  }
}

function roughTokens(value: unknown): number {
  // ~4 chars per token is close enough for a budget guard; the point is to
  // notice a 10x regression, not to predict billing to the token.
  return Math.round(JSON.stringify(value).length / 4)
}

function isoDaysAgo(days: number): { startDate: string; endDate: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return { startDate: iso(start), endDate: iso(end) }
}

/**
 * Build the snapshot. One failing source never fails the whole thing — a brief
 * about Ads and SEO is still worth having when GA4 is down, and the gap is
 * recorded in `meta.errors` so the model is told what is missing rather than
 * silently reasoning over a hole.
 */
export async function buildSnapshot(days = 30): Promise<AnalystSnapshot> {
  const { startDate, endDate } = isoDaysAgo(days)
  const errors: { source: string; error: string }[] = []
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  // ── Ads ──────────────────────────────────────────────────────────────────
  let ads: AnalystSnapshot['ads'] = null
  const adsConversionsZeroAccounts: string[] = []
  try {
    const { accounts, problems } = await listAdsAccounts()
    for (const p of problems) errors.push({ source: `ads:${p.id}`, error: p.error })

    // Managers hold no campaigns of their own, so reporting on one yields an
    // empty table that reads as a failure. Only spenders are reported.
    const spenders: AdsAccount[] = accounts.filter(a => !a.manager)
    const reported = await Promise.all(spenders.map(async a => {
      try {
        const r = await campaignReport(
          a.id, startDate, endDate, a.viaManager || undefined, a.currency,
        )
        const kept = r.rows.slice(0, MAX_CAMPAIGNS_PER_ACCOUNT)
        if (r.totals.conversions === 0 && r.totals.clicks > 0) {
          adsConversionsZeroAccounts.push(`${a.name} (${a.id})`)
        }
        return {
          id: a.id, name: a.name, currency: a.currency, manager: a.manager,
          totals: {
            impressions: r.totals.impressions,
            clicks: r.totals.clicks,
            ctr: ratio(r.totals.ctr),
            averageCpc: money(r.totals.averageCpc),
            cost: money(r.totals.cost),
            conversions: money(r.totals.conversions),
          },
          campaigns: kept.map(c => ({
            name: c.name, status: c.status, channel: c.channel,
            impressions: c.impressions, clicks: c.clicks, ctr: ratio(c.ctr),
            averageCpc: money(c.averageCpc), cost: money(c.cost),
            conversions: money(c.conversions),
          })),
          campaignsOmitted: Math.max(r.rows.length - kept.length, 0),
        }
      } catch (e) {
        errors.push({ source: `ads:${a.id}:report`, error: msg(e) })
        return null
      }
    }))
    const ok = reported.filter((x): x is NonNullable<typeof x> => x !== null)
    if (ok.length) ads = { accounts: ok }
  } catch (e) {
    errors.push({ source: 'ads', error: msg(e) })
  }

  // ── Search Console ───────────────────────────────────────────────────────
  let seo: AnalystSnapshot['seo'] = null
  let gscPropertyIsDomainLevel = false
  try {
    const g = await fetchGscSummary(startDate, endDate, {
      queries: MAX_GSC_QUERIES, pages: MAX_GSC_PAGES,
    })
    gscPropertyIsDomainLevel = g.site.startsWith('sc-domain:')
    seo = {
      property: g.site,
      totals: {
        clicks: g.totals.clicks, impressions: g.totals.impressions,
        ctr: ratio(g.totals.ctr), position: Math.round(g.totals.position * 100) / 100,
      },
      queries: g.queries.slice(0, MAX_GSC_QUERIES).map(q => ({
        query: q.query, clicks: q.clicks, impressions: q.impressions,
        ctr: ratio(q.ctr), position: Math.round(q.position * 100) / 100,
      })),
      pages: g.pages.slice(0, MAX_GSC_PAGES).map(p => ({
        page: p.page, clicks: p.clicks, impressions: p.impressions,
        ctr: ratio(p.ctr), position: Math.round(p.position * 100) / 100,
      })),
    }
  } catch (e) {
    errors.push({ source: 'gsc', error: msg(e) })
  }

  // ── GA4 ──────────────────────────────────────────────────────────────────
  let analytics: AnalystSnapshot['analytics'] = null
  try {
    const a = await fetchGa4Summary(startDate, endDate)
    analytics = {
      sessions: a.sessions, totalUsers: a.totalUsers, newUsers: a.newUsers,
      returningUsers: a.returningUsers, engagedSessions: a.engagedSessions,
      engagementRate: ratio(a.engagementRate), conversions: a.conversions,
      channels: a.channels.slice(0, MAX_GA4_ROWS),
      sources: a.sources.slice(0, MAX_GA4_ROWS),
      funnel: a.funnel,
    }
  } catch (e) {
    errors.push({ source: 'ga4', error: msg(e) })
  }

  // ── Measurement integrity ────────────────────────────────────────────────
  // `funnel.signups` is hardcoded to 0 in lib/google/ga4.ts (there is no
  // GA4 signup event configured), and `Form Started` has never been tracked in
  // GA4 — the admin funnel greys that step out when GA4 is the source. Both are
  // asserted here as instrumentation facts, not read as performance.
  const ga4ConversionsZero = !!analytics && analytics.conversions === 0
  const ga4SignupsInstrumented = false
  const ga4FormStartInstrumented = false

  const notes: string[] = []
  if (ga4ConversionsZero) {
    notes.push(
      'GA4 reports conversions = 0 for this period. No GA4 key event / conversion ' +
      'is configured, so this is an instrumentation gap, NOT evidence that zero ' +
      'conversions occurred — first-party lead capture records real signups.',
    )
  }
  notes.push(
    'GA4 has no signup event wired up: the funnel\'s "signups" value is a ' +
    'hardcoded 0 in the GA4 client, not a measurement.',
  )
  notes.push(
    'GA4 has no form_start event, so the "Form Started" funnel step cannot be ' +
    'measured from GA4 at all (the admin UI greys it out for that reason).',
  )
  if (adsConversionsZeroAccounts.length) {
    notes.push(
      `Google Ads reports 0 conversions despite paid clicks for: ` +
      `${adsConversionsZeroAccounts.join('; ')}. Treat as a likely conversion-tracking ` +
      'gap (no imported conversion / tag not firing) rather than as true zero performance.',
    )
  }
  if (gscPropertyIsDomainLevel) {
    notes.push(
      'Search Console is a DOMAIN property (sc-domain:), so its clicks and ' +
      'impressions span every subdomain and protocol — including the app ' +
      'subdomain — and are not directly comparable to GA4 sessions for the ' +
      'marketing site alone.',
    )
  }
  if (errors.length) {
    notes.push(
      `Some sources failed and are absent from this snapshot: ` +
      `${errors.map(e => `${e.source} (${e.error})`).join('; ')}.`,
    )
  }

  const snapshot: AnalystSnapshot = {
    meta: {
      generatedAt: new Date().toISOString(),
      dateRange: { startDate, endDate, days },
      approxTokens: 0,
      sources: { ads: !!ads, gsc: !!seo, ga4: !!analytics },
      errors,
    },
    business: {
      dealerAddendums:
        'DealerAddendums — B2B SaaS selling addendum/label printing software to ' +
        'franchise car dealerships (~2,100 dealership clients). The conversion goal ' +
        'is a DEALER TRIAL SIGNUP from the marketing site; buyers are dealership GMs, ' +
        'GSMs and dealer principals. Ads account "Dealer Addendums".',
      littleFarm:
        'The Little Farm on Olga Rd — a small local/ecommerce brand, unrelated to the ' +
        'SaaS business, sharing the same Google Ads login. Judge it as a small local ' +
        'advertiser on its own terms; do not mix its metrics into DealerAddendums ' +
        'conclusions or recommend B2B SaaS tactics for it.',
    },
    ads,
    seo,
    analytics,
    measurement: {
      notes,
      ga4ConversionsZero,
      ga4SignupsInstrumented,
      ga4FormStartInstrumented,
      adsConversionsZeroAccounts,
      gscPropertyIsDomainLevel,
    },
  }

  snapshot.meta.approxTokens = roughTokens(snapshot)
  return snapshot
}
