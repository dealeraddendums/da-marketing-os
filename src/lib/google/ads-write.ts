// Google Ads WRITE path — the only code in this repo that can change an Ads
// account, and the only code that can spend money.
//
// ── What can and cannot be written ─────────────────────────────────────────
// There is NO function here for a budget change or a bidding-strategy change,
// and there must never be one. Those are the two levers that can run up spend
// fastest, and they are excluded structurally rather than by policy: no mutate
// exists, and migration 014 removed `budget_change` / `bid_change` from the
// proposed_changes type constraint so the database cannot even hold such a row.
//
// ── Three gates, all of which must pass ────────────────────────────────────
//   1. ADS_WRITES_ENABLED must be exactly 'true'. Anything else — unset,
//      'false', '1', 'yes' — is dry run. Fail-closed on purpose: a typo in the
//      env must not arm live spending.
//   2. Every mutation must carry an APPROVED proposal row. The caller passes
//      it; there is no code path here that invents its own work.
//   3. At most MAX_MUTATIONS_PER_BATCH per apply call.
//
// Dry run returns exactly what it WOULD have sent, so the batch is reviewable
// before anything is armed.

import { getAccessToken } from './oauth'
import { normalizeCustomerId } from './config'

const API_VERSION = 'v25'
const BASE = `https://googleads.googleapis.com/${API_VERSION}`

/** Ships false. Flip to exactly 'true' in .env.production to arm live writes. */
export const adsWritesEnabled = process.env.ADS_WRITES_ENABLED === 'true'

/** A human reviews a batch; 25 is about the most that can be reviewed
 *  attentively, and it bounds the damage of a mistaken approve-all. */
export const MAX_MUTATIONS_PER_BATCH = 25

// ── RSA validation ──────────────────────────────────────────────────────────
// Google enforces these limits and rejects the whole mutate if any asset is
// over, so they are checked here first: a local failure is a readable error on
// one proposal instead of an opaque 400 that fails a batch.

export const RSA_LIMITS = {
  maxHeadlines: 15,
  minHeadlines: 3,
  headlineMaxChars: 30,
  maxDescriptions: 4,
  minDescriptions: 2,
  descriptionMaxChars: 90,
  pathMaxChars: 15,
} as const

export interface RsaDraft {
  headlines: string[]
  descriptions: string[]
  finalUrls: string[]
  path1?: string | null
  path2?: string | null
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

/** Count CODE POINTS, not UTF-16 units. An emoji or an astral character is one
 *  character to Google and to a human, but two in JavaScript's `.length`, which
 *  would reject a legal headline. Array.from (not spread) because this
 *  project's tsconfig target predates downlevel iteration — the same
 *  constraint noted in lib/google/cache.ts. */
function charLen(s: string): number {
  return Array.from(s ?? '').length
}

/**
 * Validate an RSA draft against Google's limits.
 */
export function validateRsa(draft: RsaDraft): ValidationResult {
  const errors: string[] = []
  const h = draft.headlines ?? []
  const d = draft.descriptions ?? []

  if (h.length < RSA_LIMITS.minHeadlines) {
    errors.push(`needs at least ${RSA_LIMITS.minHeadlines} headlines, has ${h.length}`)
  }
  if (h.length > RSA_LIMITS.maxHeadlines) {
    errors.push(`at most ${RSA_LIMITS.maxHeadlines} headlines, has ${h.length}`)
  }
  if (d.length < RSA_LIMITS.minDescriptions) {
    errors.push(`needs at least ${RSA_LIMITS.minDescriptions} descriptions, has ${d.length}`)
  }
  if (d.length > RSA_LIMITS.maxDescriptions) {
    errors.push(`at most ${RSA_LIMITS.maxDescriptions} descriptions, has ${d.length}`)
  }

  h.forEach((text, i) => {
    const n = charLen(text)
    if (!text || !text.trim()) errors.push(`headline ${i + 1} is empty`)
    else if (n > RSA_LIMITS.headlineMaxChars) {
      errors.push(`headline ${i + 1} is ${n} chars (max ${RSA_LIMITS.headlineMaxChars}): "${text}"`)
    }
  })
  d.forEach((text, i) => {
    const n = charLen(text)
    if (!text || !text.trim()) errors.push(`description ${i + 1} is empty`)
    else if (n > RSA_LIMITS.descriptionMaxChars) {
      errors.push(`description ${i + 1} is ${n} chars (max ${RSA_LIMITS.descriptionMaxChars}): "${text}"`)
    }
  })

  // Duplicate headlines are rejected by Google and are a common LLM output.
  const seen = new Set<string>()
  for (const text of h) {
    const key = (text ?? '').trim().toLowerCase()
    if (key && seen.has(key)) errors.push(`duplicate headline: "${text}"`)
    seen.add(key)
  }

  for (const [label, v] of [['path1', draft.path1], ['path2', draft.path2]] as const) {
    if (v && charLen(v) > RSA_LIMITS.pathMaxChars) {
      errors.push(`${label} is ${charLen(v)} chars (max ${RSA_LIMITS.pathMaxChars})`)
    }
  }
  if (!draft.finalUrls?.length || !draft.finalUrls[0]) {
    errors.push('finalUrls is required')
  } else if (!/^https:\/\//i.test(draft.finalUrls[0])) {
    errors.push(`finalUrls[0] must be https: "${draft.finalUrls[0]}"`)
  }

  return { ok: errors.length === 0, errors }
}

// ── Mutate primitives ───────────────────────────────────────────────────────

export type MutateKind =
  | 'negative_keyword' | 'new_keyword' | 'new_ad'
  | 'updated_ad' | 'pause_ad' | 'enable_ad' | 'google_recommendation'

export interface MutatePayload {
  kind: MutateKind
  customerId: string
  loginCustomerId?: string | null
  /** Resource-name targets, per kind. */
  campaignResource?: string
  adGroupResource?: string
  adResource?: string
  recommendationResource?: string
  keyword?: { text: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD' }
  /** Campaign-level negatives are broader; ad-group-level are surgical. */
  level?: 'campaign' | 'ad_group'
  rsa?: RsaDraft
}

export interface MutateResult {
  ok: boolean
  dryRun: boolean
  /** The exact request(s) that were (or would have been) sent. */
  requests: { endpoint: string; body: unknown }[]
  /** Google's parsed responses, empty on a dry run. */
  responses: unknown[]
  resourceNames: string[]
  error?: string
}

async function callMutate(
  customerId: string, endpoint: string, body: unknown, loginCustomerId?: string | null,
): Promise<{ ok: boolean; json: any; raw: string; status: number }> {
  const token = await getAccessToken()
  const cid = normalizeCustomerId(customerId)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const login = normalizeCustomerId(loginCustomerId || '')
  if (login) headers['login-customer-id'] = login

  const url = `${BASE}/customers/${cid}/${endpoint}`
  const res = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store',
  })
  const raw = await res.text()
  let json: any = null
  try { json = JSON.parse(raw) } catch { /* HTML or empty */ }

  if (!res.ok) {
    // The whole body: a mutate failure names the offending field and carries
    // the requestId Google support asks for. Losing it means guessing.
    console.error(
      `[ads-write] ${endpoint} customer=${cid} HTTP ${res.status} — raw body follows:\n${raw}`,
    )
    console.error(`[ads-write] request body was: ${JSON.stringify(body)}`)
  } else {
    console.log(`[ads-write] ${endpoint} customer=${cid} OK — ${raw.slice(0, 400)}`)
  }
  return { ok: res.ok, json, raw, status: res.status }
}

function errorMessage(json: any, raw: string, status: number): string {
  const errs = json?.error?.details?.[0]?.errors
  if (Array.isArray(errs) && errs.length) {
    return errs.map((e: any) => `${JSON.stringify(e.errorCode)} ${e.message}`).join(' | ')
  }
  return json?.error?.message || `HTTP ${status}: ${raw.slice(0, 300)}`
}

/** Resource names out of a mutate response, whatever the operation shape. */
function collectResourceNames(json: any): string[] {
  const out: string[] = []
  for (const r of json?.results ?? []) if (r?.resourceName) out.push(r.resourceName)
  return out
}

/**
 * Apply one approved proposal.
 *
 * Validates, then either sends or (in dry run) returns the request it would
 * have sent. Never throws: a failure is a result with `ok: false` so one bad
 * proposal cannot abort a batch.
 */
export async function applyMutation(p: MutatePayload): Promise<MutateResult> {
  const dryRun = !adsWritesEnabled
  const requests: { endpoint: string; body: unknown }[] = []

  // ── Build the request(s) ──────────────────────────────────────────────────
  try {
    if (p.kind === 'negative_keyword') {
      if (!p.keyword?.text) throw new Error('keyword.text is required')
      if (p.level === 'campaign') {
        if (!p.campaignResource) throw new Error('campaignResource is required for a campaign-level negative')
        requests.push({
          endpoint: 'campaignCriteria:mutate',
          body: { operations: [{ create: {
            campaign: p.campaignResource,
            negative: true,
            keyword: { text: p.keyword.text, matchType: p.keyword.matchType },
          } }] },
        })
      } else {
        if (!p.adGroupResource) throw new Error('adGroupResource is required for an ad-group-level negative')
        requests.push({
          endpoint: 'adGroupCriteria:mutate',
          body: { operations: [{ create: {
            adGroup: p.adGroupResource,
            negative: true,
            keyword: { text: p.keyword.text, matchType: p.keyword.matchType },
          } }] },
        })
      }
    } else if (p.kind === 'new_keyword') {
      if (!p.adGroupResource) throw new Error('adGroupResource is required')
      if (!p.keyword?.text) throw new Error('keyword.text is required')
      requests.push({
        endpoint: 'adGroupCriteria:mutate',
        body: { operations: [{ create: {
          adGroup: p.adGroupResource,
          status: 'ENABLED',
          keyword: { text: p.keyword.text, matchType: p.keyword.matchType },
        } }] },
      })
    } else if (p.kind === 'new_ad' || p.kind === 'updated_ad') {
      if (!p.adGroupResource) throw new Error('adGroupResource is required')
      if (!p.rsa) throw new Error('rsa draft is required')
      const v = validateRsa(p.rsa)
      if (!v.ok) throw new Error(`RSA validation failed: ${v.errors.join('; ')}`)
      requests.push({
        endpoint: 'adGroupAds:mutate',
        body: { operations: [{ create: {
          adGroup: p.adGroupResource,
          status: 'ENABLED',
          ad: {
            finalUrls: p.rsa.finalUrls,
            responsiveSearchAd: {
              headlines: p.rsa.headlines.map(text => ({ text })),
              descriptions: p.rsa.descriptions.map(text => ({ text })),
              ...(p.rsa.path1 ? { path1: p.rsa.path1 } : {}),
              ...(p.rsa.path2 ? { path2: p.rsa.path2 } : {}),
            },
          },
        } }] },
      })
      // updated_ad is create-new-then-pause-old, never an in-place edit: RSA
      // text assets cannot be reliably updated in place, and replacing rather
      // than editing preserves the old ad's performance history for the
      // before/after comparison.
      if (p.kind === 'updated_ad') {
        if (!p.adResource) throw new Error('adResource (the ad to pause) is required for updated_ad')
        requests.push({
          endpoint: 'adGroupAds:mutate',
          body: {
            operations: [{ update: { resourceName: p.adResource, status: 'PAUSED' }, updateMask: 'status' }],
          },
        })
      }
    } else if (p.kind === 'pause_ad' || p.kind === 'enable_ad') {
      if (!p.adResource) throw new Error('adResource is required')
      requests.push({
        endpoint: 'adGroupAds:mutate',
        body: {
          operations: [{
            update: { resourceName: p.adResource, status: p.kind === 'pause_ad' ? 'PAUSED' : 'ENABLED' },
            updateMask: 'status',
          }],
        },
      })
    } else if (p.kind === 'google_recommendation') {
      if (!p.recommendationResource) throw new Error('recommendationResource is required')
      requests.push({
        endpoint: 'recommendations:apply',
        body: { operations: [{ resourceName: p.recommendationResource }] },
      })
    } else {
      throw new Error(`unsupported mutation kind: ${String(p.kind)}`)
    }
  } catch (err) {
    return {
      ok: false, dryRun, requests, responses: [], resourceNames: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (dryRun) {
    console.log(
      `[ads-write] DRY RUN (ADS_WRITES_ENABLED is not 'true') — would send ` +
      `${requests.length} request(s) for ${p.kind}: ${JSON.stringify(requests)}`,
    )
    return { ok: true, dryRun: true, requests, responses: [], resourceNames: [] }
  }

  // ── Send, in order ────────────────────────────────────────────────────────
  // Sequential, not parallel: for updated_ad the pause must follow a
  // successfully created replacement, or a failure would leave the ad group
  // with nothing running.
  const responses: unknown[] = []
  const resourceNames: string[] = []
  for (let i = 0; i < requests.length; i++) {
    const r = requests[i]
    const res = await callMutate(p.customerId, r.endpoint, r.body, p.loginCustomerId)
    responses.push(res.json ?? res.raw)
    if (!res.ok) {
      return {
        ok: false, dryRun: false, requests, responses, resourceNames,
        error:
          `${errorMessage(res.json, res.raw, res.status)}` +
          (i > 0 ? ` (request ${i + 1} of ${requests.length} failed; earlier request(s) already applied)` : ''),
      }
    }
    resourceNames.push(...collectResourceNames(res.json))
  }
  return { ok: true, dryRun: false, requests, responses, resourceNames }
}

/** What to measure for before/after, per change kind. A keyword or negative is
 *  measured at ad-group level — the point of a negative is the ad group's
 *  waste, and a new keyword has no history of its own to compare. */
export function resultScopeFor(
  kind: MutateKind, ids: { adGroupId?: string | null; adId?: string | null; campaignId?: string | null },
): { kind: 'ad_group' | 'ad' | 'campaign' | 'account'; id?: string } {
  if ((kind === 'pause_ad' || kind === 'enable_ad' || kind === 'new_ad' || kind === 'updated_ad') && ids.adId) {
    return { kind: 'ad', id: ids.adId }
  }
  if (ids.adGroupId) return { kind: 'ad_group', id: ids.adGroupId }
  if (ids.campaignId) return { kind: 'campaign', id: ids.campaignId }
  return { kind: 'account' }
}
