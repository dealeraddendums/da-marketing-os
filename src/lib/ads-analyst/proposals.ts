// Turn Claude's proposals into approval-queue rows carrying exact mutate
// parameters.
//
// This is the boundary where a language model's output becomes something that
// can change a live ad account, so it is deliberately strict: a proposal is
// either resolved to real Google resource names and validated, or it is
// rejected here with a reason and never reaches the queue. Nothing is
// "best effort" — an unapplyable row in an approval queue is worse than no row,
// because a human will approve it and then see an opaque failure.

import { validateRsa, type MutatePayload } from '@/lib/google/ads-write'
import type { AdsSnapshot } from './snapshot'
import type { Proposal } from './analyze'

export interface PreparedProposal {
  type: Proposal['type']
  summary: string
  evidence: string
  expected_impact: string
  target_campaign_id: string | null
  target_ad_group_id: string | null
  target_resource: string | null
  target_label: string
  before_json: unknown
  after_json: unknown
  payload: MutatePayload
  recommendation_type: string | null
  recommendation_verdict: 'implement' | 'reject' | 'defer' | null
}

export interface PrepareOutcome {
  prepared: PreparedProposal[]
  /** Proposals that could not be made applyable, with why. Surfaced rather
   *  than silently dropped — a model that keeps inventing ad group ids is
   *  something the operator should see. */
  rejected: { summary: string; type: string; reason: string }[]
}

const MATCH_TYPES = ['EXACT', 'PHRASE', 'BROAD'] as const
function matchType(v: unknown): 'EXACT' | 'PHRASE' | 'BROAD' | null {
  const s = String(v ?? '').toUpperCase()
  return (MATCH_TYPES as readonly string[]).includes(s) ? (s as 'EXACT' | 'PHRASE' | 'BROAD') : null
}

export function prepareProposals(
  snapshot: AdsSnapshot, proposals: Proposal[], loginCustomerId?: string | null,
): PrepareOutcome {
  const cid = snapshot.meta.customerId
  const prepared: PreparedProposal[] = []
  const rejected: { summary: string; type: string; reason: string }[] = []

  const adGroupById = new Map(snapshot.adGroups.map(g => [String(g.adGroupId), g]))
  const campaignByName = new Map(snapshot.campaigns.map(c => [c.name.toLowerCase(), c]))
  const adById = new Map(snapshot.ads.map(a => [String(a.adId), a]))
  const recByResource = new Map(snapshot.recommendations.map(r => [r.resourceName, r]))

  const adGroupResource = (id: string) => `customers/${cid}/adGroups/${id}`
  const campaignResource = (id: string) => `customers/${cid}/campaigns/${id}`

  const base = (p: Proposal) => ({
    summary: String(p.summary ?? '').slice(0, 500),
    evidence: String(p.evidence ?? ''),
    expected_impact: String(p.expected_impact ?? ''),
  })

  for (const p of proposals) {
    const reject = (reason: string) =>
      rejected.push({ summary: String(p?.summary ?? '(no summary)'), type: String(p?.type ?? '?'), reason })

    try {
      if (p.type === 'negative_keyword') {
        const mt = matchType(p.match_type)
        if (!p.keyword_text?.trim()) { reject('keyword_text is empty'); continue }
        if (!mt) { reject(`invalid match_type "${p.match_type}"`); continue }

        if (p.level === 'campaign') {
          const camp = p.campaign_name ? campaignByName.get(p.campaign_name.toLowerCase()) : undefined
          if (!camp) { reject(`campaign_name "${p.campaign_name}" is not in the snapshot`); continue }
          prepared.push({
            ...base(p), type: p.type,
            target_campaign_id: camp.id, target_ad_group_id: null,
            target_resource: campaignResource(camp.id),
            target_label: `Negative "${p.keyword_text}" (${mt}) — campaign ${camp.name}`,
            before_json: null,
            after_json: { negative: p.keyword_text, matchType: mt, level: 'campaign', campaign: camp.name },
            payload: {
              kind: 'negative_keyword', customerId: cid, loginCustomerId: loginCustomerId ?? null,
              level: 'campaign', campaignResource: campaignResource(camp.id),
              keyword: { text: p.keyword_text.trim(), matchType: mt },
            },
            recommendation_type: null, recommendation_verdict: null,
          })
        } else {
          const g = p.ad_group_id ? adGroupById.get(String(p.ad_group_id)) : undefined
          if (!g) { reject(`ad_group_id "${p.ad_group_id}" is not in the snapshot`); continue }
          prepared.push({
            ...base(p), type: p.type,
            target_campaign_id: null, target_ad_group_id: g.adGroupId,
            target_resource: adGroupResource(g.adGroupId),
            target_label: `Negative "${p.keyword_text}" (${mt}) — ad group ${g.adGroup}`,
            before_json: null,
            after_json: { negative: p.keyword_text, matchType: mt, level: 'ad_group', adGroup: g.adGroup },
            payload: {
              kind: 'negative_keyword', customerId: cid, loginCustomerId: loginCustomerId ?? null,
              level: 'ad_group', adGroupResource: adGroupResource(g.adGroupId),
              keyword: { text: p.keyword_text.trim(), matchType: mt },
            },
            recommendation_type: null, recommendation_verdict: null,
          })
        }

      } else if (p.type === 'new_keyword') {
        const mt = matchType(p.match_type)
        const g = adGroupById.get(String(p.ad_group_id))
        if (!p.keyword_text?.trim()) { reject('keyword_text is empty'); continue }
        if (!mt) { reject(`invalid match_type "${p.match_type}"`); continue }
        if (!g) { reject(`ad_group_id "${p.ad_group_id}" is not in the snapshot`); continue }
        prepared.push({
          ...base(p), type: p.type,
          target_campaign_id: null, target_ad_group_id: g.adGroupId,
          target_resource: adGroupResource(g.adGroupId),
          target_label: `Keyword "${p.keyword_text}" (${mt}) → ${g.adGroup}`,
          before_json: null,
          after_json: { keyword: p.keyword_text, matchType: mt, adGroup: g.adGroup },
          payload: {
            kind: 'new_keyword', customerId: cid, loginCustomerId: loginCustomerId ?? null,
            adGroupResource: adGroupResource(g.adGroupId),
            keyword: { text: p.keyword_text.trim(), matchType: mt },
          },
          recommendation_type: null, recommendation_verdict: null,
        })

      } else if (p.type === 'new_ad' || p.type === 'updated_ad') {
        const g = adGroupById.get(String(p.ad_group_id))
        if (!g) { reject(`ad_group_id "${p.ad_group_id}" is not in the snapshot`); continue }
        const rsa = {
          headlines: (p.headlines ?? []).map(h => String(h).trim()).filter(Boolean),
          descriptions: (p.descriptions ?? []).map(d => String(d).trim()).filter(Boolean),
          finalUrls: [String(p.final_url ?? '').trim()],
          path1: p.path1 ? String(p.path1) : null,
          path2: p.path2 ? String(p.path2) : null,
        }
        // Validated HERE, at proposal time, not at apply time: an ad that
        // breaks Google's limits must never reach the queue, because a human
        // would approve it and get an opaque 400 minutes later.
        const v = validateRsa(rsa)
        if (!v.ok) { reject(`RSA invalid — ${v.errors.join('; ')}`); continue }

        let adResource: string | undefined
        let old: unknown = null
        if (p.type === 'updated_ad') {
          const a = p.replace_ad_id ? adById.get(String(p.replace_ad_id)) : undefined
          if (!a) { reject(`replace_ad_id "${p.replace_ad_id}" is not in the snapshot`); continue }
          if (!a.resourceName) { reject(`ad ${p.replace_ad_id} has no resource name`); continue }
          adResource = a.resourceName
          old = {
            adId: a.adId, adType: a.adType, adStrength: a.adStrength,
            headlines: a.headlines, descriptions: a.descriptions,
            impressions: a.impressions, clicks: a.clicks, ctr: a.ctr,
            cost: a.cost, conversions: a.conversions,
          }
        }

        prepared.push({
          ...base(p), type: p.type,
          target_campaign_id: null, target_ad_group_id: g.adGroupId,
          target_resource: adResource ?? adGroupResource(g.adGroupId),
          target_label: p.type === 'new_ad'
            ? `New RSA → ${g.adGroup}`
            : `Replace ad ${p.replace_ad_id} → ${g.adGroup}`,
          before_json: old,
          after_json: {
            headlines: rsa.headlines, descriptions: rsa.descriptions,
            finalUrl: rsa.finalUrls[0], path1: rsa.path1, path2: rsa.path2,
            adGroup: g.adGroup,
          },
          payload: {
            kind: p.type, customerId: cid, loginCustomerId: loginCustomerId ?? null,
            adGroupResource: adGroupResource(g.adGroupId),
            ...(adResource ? { adResource } : {}),
            rsa,
          },
          recommendation_type: null, recommendation_verdict: null,
        })

      } else if (p.type === 'pause_ad' || p.type === 'enable_ad') {
        const a = adById.get(String(p.ad_id))
        if (!a) { reject(`ad_id "${p.ad_id}" is not in the snapshot`); continue }
        if (!a.resourceName) { reject(`ad ${p.ad_id} has no resource name`); continue }
        prepared.push({
          ...base(p), type: p.type,
          target_campaign_id: null, target_ad_group_id: a.adGroupId,
          target_resource: a.resourceName,
          target_label: `${p.type === 'pause_ad' ? 'Pause' : 'Enable'} ad ${a.adId} — ${a.adGroup}`,
          before_json: { status: a.status, impressions: a.impressions, clicks: a.clicks, cost: a.cost },
          after_json: { status: p.type === 'pause_ad' ? 'PAUSED' : 'ENABLED' },
          payload: {
            kind: p.type, customerId: cid, loginCustomerId: loginCustomerId ?? null,
            adResource: a.resourceName,
          },
          recommendation_type: null, recommendation_verdict: null,
        })

      } else if (p.type === 'google_recommendation') {
        const rec = recByResource.get(p.recommendation_resource_name)
        if (!rec) { reject(`recommendation "${p.recommendation_resource_name}" is not in the snapshot`); continue }
        const verdict = ['implement', 'reject', 'defer'].includes(p.verdict) ? p.verdict : null
        if (!verdict) { reject(`invalid verdict "${p.verdict}"`); continue }
        prepared.push({
          ...base(p), type: p.type,
          target_campaign_id: null, target_ad_group_id: null,
          target_resource: rec.resourceName,
          target_label: `Google recommendation: ${rec.type} → ${verdict}`,
          before_json: { base: rec.base, dismissed: rec.dismissed },
          after_json: { potential: rec.potential, verdict },
          payload: {
            kind: 'google_recommendation', customerId: cid, loginCustomerId: loginCustomerId ?? null,
            recommendationResource: rec.resourceName,
          },
          recommendation_type: rec.type,
          recommendation_verdict: verdict,
        })

      } else {
        reject(`unknown proposal type "${(p as { type?: string }).type}"`)
      }
    } catch (err) {
      reject(`could not prepare: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { prepared, rejected }
}

/**
 * Which prepared proposals should become PENDING approval rows.
 *
 * A `google_recommendation` with verdict reject or defer is a recorded
 * judgement, not a pending action — it goes straight to 'rejected' so the
 * reasoning is kept without ever offering an Approve button for something the
 * analyst advised against. Only `implement` waits for a human.
 */
export function initialStatusFor(p: PreparedProposal): 'pending' | 'rejected' {
  if (p.type === 'google_recommendation' && p.recommendation_verdict !== 'implement') return 'rejected'
  return 'pending'
}
