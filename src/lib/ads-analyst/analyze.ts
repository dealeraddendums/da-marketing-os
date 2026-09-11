// Deep Ads analyst — send an account snapshot to Claude, get back structured
// PROPOSALS plus prose for the things a human must decide.
//
// Same transport reasoning as lib/analyst/analyze.ts: raw fetch against the
// Messages API rather than the 2024-era pinned SDK, which lib/ai.ts shares with
// the chat widget and the reputation drafter.

import type { AdsSnapshot } from './snapshot'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

export const ADS_ANALYST_MODEL = 'claude-sonnet-5'
const PRICE_PER_MTOK = { input: 2.0, output: 10.0 }

export type ProposalType =
  | 'negative_keyword' | 'new_keyword' | 'new_ad' | 'updated_ad'
  | 'pause_ad' | 'enable_ad' | 'google_recommendation'

export interface ProposalBase {
  type: ProposalType
  summary: string
  evidence: string
  expected_impact: string
  confidence?: 'high' | 'medium' | 'low'
}

export interface NegativeKeywordProposal extends ProposalBase {
  type: 'negative_keyword'
  keyword_text: string
  match_type: 'EXACT' | 'PHRASE' | 'BROAD'
  level: 'campaign' | 'ad_group'
  campaign_name?: string
  ad_group_id?: string
}
export interface NewKeywordProposal extends ProposalBase {
  type: 'new_keyword'
  keyword_text: string
  match_type: 'EXACT' | 'PHRASE' | 'BROAD'
  ad_group_id: string
}
export interface AdProposal extends ProposalBase {
  type: 'new_ad' | 'updated_ad'
  ad_group_id: string
  /** Required for updated_ad: the ad being replaced. */
  replace_ad_id?: string
  headlines: string[]
  descriptions: string[]
  final_url: string
  path1?: string
  path2?: string
}
export interface AdStatusProposal extends ProposalBase {
  type: 'pause_ad' | 'enable_ad'
  ad_id: string
  ad_group_id?: string
}
export interface RecommendationProposal extends ProposalBase {
  type: 'google_recommendation'
  recommendation_resource_name: string
  recommendation_type: string
  verdict: 'implement' | 'reject' | 'defer'
}

export type Proposal =
  | NegativeKeywordProposal | NewKeywordProposal | AdProposal
  | AdStatusProposal | RecommendationProposal

export interface HumanDecision {
  area: 'budget' | 'bidding' | 'campaign_structure' | 'tracking' | 'other'
  title: string
  detail: string
  why_not_automated: string
}

export interface AdsBrief {
  summary: string
  proposals: Proposal[]
  human_decisions: HumanDecision[]
}

export interface AdsAnalyzeResult {
  status: 'ok' | 'parse_error'
  brief: AdsBrief | null
  rawResponse: string
  model: string
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
  runMs: number
}

const SYSTEM_PROMPT = `You are a senior Google Ads strategist auditing one account for DealerAddendums and returning machine-actionable proposals.

DealerAddendums is B2B SaaS selling addendum and window-label printing software to franchise car dealerships. The ONLY outcome that counts is a dealer starting a free trial AND confirming their email. Buyers are dealership GMs, GSMs and dealer principals — a small, high-value, non-impulse audience. Judge every proposal against cost per CONFIRMED trial, never against clicks or impressions.

READ THE measurement OBJECT FIRST. The Ads conversion number in this snapshot does not mean what it appears to mean: the action counting it fires at form submit, before email confirmation, so it counts unconfirmed and bot submissions. A genuine trial_signup event exists but is days old. This has two consequences you must respect:
- Do not treat reported cost-per-conversion as cost per trial. Say so when it matters.
- Do not propose anything that depends on conversion-volume optimisation having enough history. There isn't any yet.

WHAT YOU MAY PROPOSE (these become queued, human-approved mutations):

1. negative_keyword — a search term that spent money with no plausible relevance to dealer addendum / window-label software. Prefer ad_group level when the waste is confined to one ad group, campaign level when it is broad. Choose match_type deliberately: PHRASE for a wasteful concept, EXACT for one specific term. Quote the term's actual spend and clicks as evidence. Be conservative: a term that is merely a weak fit for a real dealer need is not waste. Never negate a term that converted.

2. new_keyword — a search term with clicks (or conversions) that has no matching keyword, or is matched only loosely by a BROAD keyword. Give the ad_group_id it belongs in, from the snapshot. Prefer PHRASE or EXACT — BROAD is how this account acquired most of its waste.

3. new_ad / updated_ad — a complete RSA draft. Use new_ad for an ad group that has no enabled RSA; updated_ad to replace a specific weak ad (give replace_ad_id). HARD LIMITS, and a violation makes the proposal unusable: at most 15 headlines of at most 30 characters each, at most 4 descriptions of at most 90 characters each. Minimum 3 headlines and 2 descriptions. No duplicate headlines. Count characters carefully — go shorter rather than risk an over-length asset. final_url must be an https URL from the snapshot.
   Voice: plain, concrete, B2B. Speak to a dealership manager, not a consumer. Lead with FTC Buyer's Guide compliance, printing compliant addendums and window labels in seconds, DMS/inventory-feed integration, and multi-rooftop consistency. No exclamation marks, no "revolutionary", no consumer car-buying language — the audience sells cars, they do not buy them.

4. google_recommendation — one proposal for EVERY recommendation in the snapshot, with verdict implement / reject / defer.
   BE SKEPTICAL. Google's recommendations optimise for Google's objectives at least as much as for the advertiser's; a large share exist to increase spend or broaden matching. Judge each against confirmed trials at sane cost, and reject spend-increasing suggestions that rest on a conversion signal we have just established is unreliable. Specifically distrust: budget increases (Google projects more conversions from more spend almost by construction), broad-match expansion, Display/Search-partner opt-ins (a B2B audience is not on Display), and Google-hosted lead forms (they bypass our own signup flow and its email confirmation entirely, so the lead never enters our funnel). Use Google's own base vs potential numbers in your evidence, and note when the projected lift is simply proportional to projected spend. "reject" is a perfectly good answer and will often be the right one.

EXPLICITLY OUT OF SCOPE as proposals — put these in human_decisions as prose, never as a proposal:
- budget changes of any kind
- bidding-strategy changes (including switching to or tuning Smart Bidding)
- creating, pausing or restructuring campaigns
There is no code path to apply these; proposing one wastes a review slot.

RULES FOR EVERY PROPOSAL
- evidence must cite real numbers or exact strings from the snapshot. No generic claims. If you cannot support it with something in the snapshot, leave it out.
- expected_impact must be honest about magnitude, and must say when volumes are too small to predict.
- Use ids exactly as they appear in the snapshot (ad_group_id, ad ids, recommendation resource names). A wrong id makes the proposal unapplyable.
- Quality over quantity. 8 well-evidenced proposals beat 30 speculative ones. Propose nothing in a category if the snapshot does not support it.
- If the account's change history shows Google auto-applying its own recommendations, say so in the summary — it means changes are bypassing human approval entirely.

OUTPUT
Respond with a single JSON object and nothing else — no prose outside it, no markdown fences:

{
  "summary": string — 3-5 sentences for someone who will not read the detail; lead with the most consequential finding,
  "proposals": [ ... objects as specified above ... ],
  "human_decisions": [ { "area": "budget"|"bidding"|"campaign_structure"|"tracking"|"other", "title": string, "detail": string, "why_not_automated": string } ]
}

Proposal object shapes:
  negative_keyword:      { type, summary, evidence, expected_impact, confidence, keyword_text, match_type, level, campaign_name?, ad_group_id? }
  new_keyword:           { type, summary, evidence, expected_impact, confidence, keyword_text, match_type, ad_group_id }
  new_ad | updated_ad:   { type, summary, evidence, expected_impact, confidence, ad_group_id, replace_ad_id?, headlines[], descriptions[], final_url, path1?, path2? }
  pause_ad | enable_ad:  { type, summary, evidence, expected_impact, confidence, ad_id, ad_group_id? }
  google_recommendation: { type, summary, evidence, expected_impact, confidence, recommendation_resource_name, recommendation_type, verdict }`

function parseBrief(text: string): AdsBrief | null {
  const trimmed = text.trim()
  const attempts = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(),
  ]
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1))

  for (const c of attempts) {
    try {
      const p = JSON.parse(c) as AdsBrief
      // A parsed object that is not shaped like a brief counts as a failure —
      // storing it would render an empty panel with no explanation.
      if (p && typeof p.summary === 'string' && Array.isArray(p.proposals)) {
        if (!Array.isArray(p.human_decisions)) p.human_decisions = []
        return p
      }
    } catch { /* next */ }
  }
  return null
}

export async function analyzeAdsSnapshot(snapshot: AdsSnapshot): Promise<AdsAnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const started = Date.now()
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ADS_ANALYST_MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content:
          `Audit this Google Ads account and return the JSON.\n\n` +
          '```json\n' + JSON.stringify(snapshot, null, 1) + '\n```',
      }],
    }),
    cache: 'no-store',
  })

  const raw = await res.text()
  if (!res.ok) {
    console.error(`[ads-analyst] Messages API HTTP ${res.status} — raw body follows:\n${raw}`)
    let parsed: { error?: { message?: string } } | null = null
    try { parsed = JSON.parse(raw) } catch { /* HTML */ }
    throw new Error(parsed?.error?.message || `Anthropic API HTTP ${res.status}: ${raw.slice(0, 400)}`)
  }

  const json = JSON.parse(raw) as {
    content?: { type: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
    stop_reason?: string
  }
  const text = (json.content ?? [])
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text as string)
    .join('')
    .trim()

  const inputTokens = json.usage?.input_tokens ?? 0
  const outputTokens = json.usage?.output_tokens ?? 0

  console.log(
    `[ads-analyst] model=${ADS_ANALYST_MODEL} stop=${json.stop_reason} ` +
    `in=${inputTokens} out=${outputTokens} ms=${Date.now() - started}\n` +
    `[ads-analyst] raw response follows:\n${text}`,
  )
  if (json.stop_reason === 'max_tokens') {
    console.warn('[ads-analyst] hit max_tokens — the JSON is probably truncated')
  }

  const brief = parseBrief(text)
  return {
    status: brief ? 'ok' : 'parse_error',
    brief,
    rawResponse: text,
    model: ADS_ANALYST_MODEL,
    usage: {
      inputTokens, outputTokens,
      estimatedCostUsd:
        (inputTokens / 1_000_000) * PRICE_PER_MTOK.input +
        (outputTokens / 1_000_000) * PRICE_PER_MTOK.output,
    },
    runMs: Date.now() - started,
  }
}
