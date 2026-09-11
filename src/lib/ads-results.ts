// Results tracking — did an applied change do anything?
//
// The honest version of this is harder than it looks, so the rules are explicit:
//
//  • The "before" can only ever be captured AT APPLY TIME. Google will not
//    return that window again once it moves, so `applied_snapshot` is written
//    during apply or the comparison is impossible forever.
//  • Post-windows are measured from the apply date forward, and only once the
//    window has actually elapsed. A 14-day comparison run on day 3 is noise.
//  • Account-level metrics for the same windows ride alongside, because an ad
//    group that fell 20% while the whole account fell 25% did not get worse.
//  • Small numbers get flagged, not interpreted.

import { entityMetrics, type EntityMetrics } from '@/lib/google/ads'
import { resultScopeFor, type MutateKind } from '@/lib/google/ads-write'

export interface WindowResult {
  window: '14d' | '30d'
  measuredAt: string
  from: string
  to: string
  entity: EntityMetrics
  account: EntityMetrics
  /** Percentage deltas vs the at-apply snapshot, entity and account. */
  delta: Record<string, number | null>
  accountDelta: Record<string, number | null>
  /** Honest caveats, shown verbatim in the UI. */
  caveats: string[]
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

/** Percent change, or null when the baseline is zero — "up from 0" is not a
 *  percentage, and rendering one would invent precision. */
function pct(before: number, after: number): number | null {
  if (!before) return null
  return Math.round(((after - before) / before) * 1000) / 10
}

function deltas(before: EntityMetrics, after: EntityMetrics): Record<string, number | null> {
  return {
    impressions: pct(before.impressions, after.impressions),
    clicks: pct(before.clicks, after.clicks),
    ctr: pct(before.ctr, after.ctr),
    averageCpc: pct(before.averageCpc, after.averageCpc),
    cost: pct(before.cost, after.cost),
    conversions: pct(before.conversions, after.conversions),
  }
}

/**
 * Is there enough volume here to say anything?
 *
 * These thresholds are deliberately blunt. The alternative — reporting a 300%
 * CTR improvement off 2 clicks — is worse than admitting the measurement is
 * not yet meaningful.
 */
function caveatsFor(
  before: EntityMetrics, after: EntityMetrics, appliedAt: string, kind: string,
): string[] {
  const c: string[] = []
  const minClicks = 30, minImpr = 500
  if (before.clicks < minClicks || after.clicks < minClicks) {
    c.push(
      `Too few clicks to attribute (${before.clicks} before, ${after.clicks} after; ` +
      `${minClicks}+ in both windows is the bar). Read the direction, not the number.`,
    )
  }
  if (before.impressions < minImpr || after.impressions < minImpr) {
    c.push(`Low impression volume (${before.impressions} before, ${after.impressions} after).`)
  }
  if (before.conversions < 5 || after.conversions < 5) {
    c.push(
      'Conversion counts are in single digits, so any conversion-rate comparison here is noise. ' +
      'Note also that the Ads conversion action counts form submissions, not confirmed trials.',
    )
  }
  // Smart Bidding re-learns after a structural change; the first ~1-2 weeks
  // after one are not representative of the steady state.
  const days = Math.floor((Date.now() - new Date(appliedAt).getTime()) / 86400000)
  if (days < 21) {
    c.push(
      `Applied ${days} day(s) ago. If this campaign uses Smart Bidding, it re-enters a learning ` +
      'period after a structural change — expect 1-2 weeks of unrepresentative performance.',
    )
  }
  if (kind === 'negative_keyword') {
    c.push(
      'A negative keyword is supposed to REDUCE impressions and cost. Falling volume here is the ' +
      'intended effect, not a regression — judge it on cost and on whether conversions held.',
    )
  }
  return c
}

/**
 * Measure one post-application window for a change.
 *
 * Returns null when the window has not elapsed yet, so the caller can leave the
 * column empty rather than storing a half-formed comparison.
 */
export async function measureWindow(change: {
  target_customer_id: string
  target_ad_group_id: string | null
  target_campaign_id: string | null
  type: string
  applied_at: string
  applied_snapshot: { entity?: EntityMetrics; account?: EntityMetrics; adId?: string | null } | null
  payload?: { loginCustomerId?: string | null } | null
}, window: '14d' | '30d'): Promise<WindowResult | null> {
  const span = window === '14d' ? 14 : 30
  const appliedAt = new Date(change.applied_at)
  // Start the day AFTER application: the apply day is a partial, mixed day.
  const from = addDays(appliedAt, 1)
  const to = addDays(from, span - 1)
  if (to.getTime() > Date.now()) return null // window has not matured

  const login = change.payload?.loginCustomerId || undefined
  const scope = resultScopeFor(change.type as MutateKind, {
    adGroupId: change.target_ad_group_id,
    adId: change.applied_snapshot?.adId ?? null,
    campaignId: change.target_campaign_id,
  })

  const [entity, account] = await Promise.all([
    entityMetrics(change.target_customer_id, scope, iso(from), iso(to), login),
    entityMetrics(change.target_customer_id, { kind: 'account' }, iso(from), iso(to), login),
  ])

  const beforeEntity = change.applied_snapshot?.entity
  const beforeAccount = change.applied_snapshot?.account
  return {
    window,
    measuredAt: new Date().toISOString(),
    from: iso(from), to: iso(to),
    entity, account,
    delta: beforeEntity ? deltas(beforeEntity, entity) : {},
    accountDelta: beforeAccount ? deltas(beforeAccount, account) : {},
    caveats: beforeEntity
      ? caveatsFor(beforeEntity, entity, change.applied_at, change.type)
      : ['No at-apply snapshot was captured, so there is nothing to compare against.'],
  }
}
