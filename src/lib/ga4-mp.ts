// GA4 Measurement Protocol — server-side event delivery.
//
// ── Why server-side at all ─────────────────────────────────────────────────
// The site's GA4 is installed through GTM (container GTM-KMPMT33Q), so a
// client-side event needs a matching GTM trigger + GA4 event tag to reach GA4
// at all. More importantly, the two events this app needs to record are not
// both client-side moments:
//
//   trial_signup — a signup is real only when the applicant confirms their
//     email (Layer 0). That click comes from their email client: a different
//     GA4 session, usually with no referrer. Firing it client-side on the
//     confirmation page would attribute every trial to Direct and destroy the
//     one number this exists to produce — cost per trial by channel. Sending
//     it server-side with the client id captured in the ORIGINAL session
//     preserves the attribution.
//
//   form_start — a genuine browser interaction, but routing it through here
//     too keeps one transport, one source of truth, and needs no GTM work.
//
// ⚠️ Consequence worth remembering: because GA4 receives these two events ONLY
// via this module, do NOT also create GTM GA4 event tags named `form_start` or
// `trial_signup`. That would double-count them.

const ENDPOINT = 'https://www.google-analytics.com/mp/collect'
/** Validates a payload and returns validationMessages WITHOUT ingesting it.
 *  Used to prove a payload is well-formed without polluting reports. */
const VALIDATE_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect'

export const ga4Mp = {
  /** The web data stream's measurement ID (G-…). Discovered from the public
   *  GTM container, where the GA4 config tag carries it. */
  measurementId: process.env.GA4_MEASUREMENT_ID || '',
  /** Created in GA4 Admin → Data streams → <stream> → Measurement Protocol API
   *  secrets. Without it this module is inert and every call is a no-op. */
  apiSecret: process.env.GA4_MP_API_SECRET || '',
}

export const ga4MpConfigured = !!(ga4Mp.measurementId && ga4Mp.apiSecret)

export interface Ga4EventParams {
  [key: string]: string | number | boolean | undefined
}

export interface SendResult {
  sent: boolean
  /** Why nothing was sent, when `sent` is false. */
  reason?: 'not-configured' | 'http-error' | 'exception'
  status?: number
  /** True when a real client id was used, false when a synthetic one stood in
   *  — i.e. the event is counted but not attributable to the original session. */
  attributed: boolean
  validationMessages?: unknown
}

/**
 * A client id GA4 will accept when the real one is unavailable.
 *
 * GA4 requires a client_id on every Measurement Protocol event, so with no
 * `_ga` cookie the choice is "send an unattributed event" or "send nothing".
 * Sending wins: the primary complaint being fixed here is that conversions are
 * not COUNTED, and an unattributed conversion still counts. Derived from a
 * stable seed so repeat calls for the same lead land on one pseudo-user rather
 * than inventing a new one each time.
 */
function syntheticClientId(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const a = Math.abs(h) || 1
  // GA4's own format is <random>.<first-seen unix seconds>; matching it keeps
  // the value from looking malformed in DebugView.
  return `${a}.${Math.floor(Date.now() / 1000)}`
}

/**
 * Send one event to GA4.
 *
 * Never throws and never blocks the caller's real work — a signup must not fail
 * because analytics is down. Returns what happened so the caller can log it.
 *
 * `validateOnly` uses Google's debug endpoint, which checks the payload and
 * reports problems WITHOUT recording anything. `debugMode` records the event
 * and additionally surfaces it in GA4 DebugView; note that a debug_mode event
 * still counts in reports, so it is for deliberate test events only.
 */
export async function sendGa4Event(opts: {
  name: string
  clientId?: string | null
  sessionId?: string | null
  params?: Ga4EventParams
  /** Seed for the synthetic client id when clientId is absent. */
  fallbackSeed?: string
  validateOnly?: boolean
  debugMode?: boolean
}): Promise<SendResult> {
  if (!ga4MpConfigured) {
    console.warn(
      `[ga4-mp] skipped "${opts.name}" — GA4_MEASUREMENT_ID and/or GA4_MP_API_SECRET are not set`,
    )
    return { sent: false, reason: 'not-configured', attributed: false }
  }

  const attributed = !!opts.clientId
  const clientId = opts.clientId || syntheticClientId(opts.fallbackSeed || opts.name)

  const params: Ga4EventParams = {
    // Without a non-zero engagement time GA4 can treat the event as
    // non-engaged and it will not surface in Realtime.
    engagement_time_msec: 1,
    ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
    ...(opts.debugMode ? { debug_mode: 1 } : {}),
    ...opts.params,
  }
  // Drop undefined rather than sending nulls, which GA4 rejects per-param.
  for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k]

  const url =
    `${opts.validateOnly ? VALIDATE_ENDPOINT : ENDPOINT}` +
    `?measurement_id=${encodeURIComponent(ga4Mp.measurementId)}` +
    `&api_secret=${encodeURIComponent(ga4Mp.apiSecret)}`

  const body = JSON.stringify({ client_id: clientId, events: [{ name: opts.name, params }] })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    })
    // The collect endpoint answers 204 with an empty body; only the debug
    // endpoint returns JSON.
    const raw = await res.text()
    if (!res.ok) {
      console.error(`[ga4-mp] "${opts.name}" HTTP ${res.status} — body: ${raw.slice(0, 500)}`)
      return { sent: false, reason: 'http-error', status: res.status, attributed }
    }
    let validationMessages: unknown
    if (opts.validateOnly && raw) {
      try { validationMessages = (JSON.parse(raw) as { validationMessages?: unknown }).validationMessages } catch { /* not JSON */ }
      console.log(`[ga4-mp] VALIDATE "${opts.name}" → ${raw.slice(0, 500)}`)
    } else {
      console.log(
        `[ga4-mp] sent "${opts.name}" status=${res.status} attributed=${attributed}` +
        `${opts.debugMode ? ' debug_mode=1' : ''} params=${JSON.stringify(params)}`,
      )
    }
    return { sent: !opts.validateOnly, status: res.status, attributed, validationMessages }
  } catch (err) {
    console.error(`[ga4-mp] "${opts.name}" failed:`, err instanceof Error ? err.message : err)
    return { sent: false, reason: 'exception', attributed }
  }
}
