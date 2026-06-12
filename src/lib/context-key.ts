// Dynamic Landing Engine — visitor-context derivation (Phase 1).
//
// Pure string functions only: this module is imported by BOTH the edge
// middleware and Node API routes/pages, so it must not import Node APIs,
// the Anthropic SDK, or Supabase. The server recomputes the context key
// from raw signals (never trusts a client-supplied key).

export type Device = 'mobile' | 'tablet' | 'desktop'

export interface VisitorSignals {
  keyword: string        // matched keyword from the ad URL ({keyword} ValueTrack → utm_term/keyword/kw)
  keywordCluster: string // bounded-cardinality cluster the cache is keyed on
  dealerType: string     // detectDealerType() output
  utmCampaign: string
  device: Device
  returning: boolean
}

export const MAKE_REGEX =
  /kia|ford|toyota|honda|chevy|chevrolet|nissan|gmc|gm|bmw|mercedes|audi|hyundai|subaru|mazda|jeep|dodge|ram/i

export function normalizeMake(make: string): string {
  const m = make.toLowerCase()
  if (m === 'chevy') return 'chevrolet'
  if (m === 'gmc') return 'gm'
  return m
}

// Mirrors lib/personalization.ts detectDealerType (kept in sync; this copy is
// edge-safe and shared by middleware + server).
export function detectDealerType(text: string): string {
  const t = text.toLowerCase()
  const makeMatch = t.match(MAKE_REGEX)
  if (makeMatch) return normalizeMake(makeMatch[0])
  if (t.match(/used|independent|cpo|certified/)) return 'used-car'
  if (t.match(/franchise|group|multi|rooftop/)) return 'franchise'
  if (t.match(/ftc|compliance|buyers guide/)) return 'compliance'
  if (t.match(/ios|app|mobile|scan|vin/)) return 'mobile'
  return 'general'
}

// Bucket a raw keyword into a small topic cluster so cache cardinality stays
// bounded (raw queries are unbounded; clusters are ~30 × makes).
export function clusterKeyword(keyword: string): string {
  const t = keyword.toLowerCase().trim()
  if (!t) return 'none'
  const make = t.match(MAKE_REGEX)?.[0]
  const topic =
    /buyers? ?guide|ftc/.test(t)         ? 'buyers-guide' :
    /compliance|disclosure/.test(t)      ? 'compliance' :
    /cpo|certified|info ?sheet/.test(t)  ? 'info-sheet' :
    /vin|scan|ios|mobile|\bapp\b/.test(t)? 'mobile' :
    /qr|lead/.test(t)                    ? 'leads' :
    /inventory|feed|dms|sync/.test(t)    ? 'inventory' :
    /description/.test(t)                ? 'descriptions' :
    /addendum/.test(t)                   ? 'addendum' :
    /used|independent/.test(t)           ? 'used-car' :
    /sticker|label|window|dealer/.test(t)? 'dealer-general' :
                                           'other'
  return make ? `${normalizeMake(make)}:${topic}` : topic
}

export function detectDevice(userAgent: string): Device {
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet|kindle|silk|playbook/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) {
    return 'tablet'
  }
  if (/mobi|iphone|ipod|android/.test(ua)) return 'mobile'
  return 'desktop'
}

// FNV-1a 32-bit — deterministic, edge-safe (no crypto import), plenty for a
// cache key over a bounded signal space.
export function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function computeContextKey(s: {
  keywordCluster: string
  dealerType: string
  utmCampaign: string
  device: string
  returning: boolean
}): string {
  const parts = [
    s.keywordCluster,
    s.dealerType,
    s.utmCampaign.toLowerCase().trim(),
    s.device,
    s.returning ? 'ret' : 'new',
  ].join('|')
  return `ctx_${fnv1a(parts)}`
}

export function buildSignals(input: {
  keyword: string
  utmCampaign: string
  userAgent: string
  returning: boolean
}): VisitorSignals & { contextKey: string } {
  const keyword = input.keyword.toLowerCase().trim().slice(0, 200)
  const keywordCluster = clusterKeyword(keyword)
  const dealerType = detectDealerType(keyword + ' ' + input.utmCampaign)
  const device = detectDevice(input.userAgent)
  const signals: VisitorSignals = {
    keyword,
    keywordCluster,
    dealerType,
    utmCampaign: input.utmCampaign,
    device,
    returning: input.returning,
  }
  return { ...signals, contextKey: computeContextKey(signals) }
}

// Request-header names the middleware uses to pass context to pages.
export const CTX_HEADERS = {
  contextKey: 'x-da-context-key',
  keyword: 'x-da-keyword',
  cluster: 'x-da-keyword-cluster',
  dealerType: 'x-da-dealer-type',
  campaign: 'x-da-utm-campaign',
  device: 'x-da-device',
  returning: 'x-da-returning',
} as const
