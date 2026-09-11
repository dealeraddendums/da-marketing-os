// Client-side attribution helpers.
//
// getAttribution() reads the first-touch `da_attribution` cookie set in
// middleware.ts and returns it as snake_case fields that map 1:1 to the
// marketing_leads columns, so signup forms can spread it straight into the
// POST body. pushSignupEvent() pushes the signup conversion into GTM's
// dataLayer; the GTM container (NEXT_PUBLIC_GTM_ID) routes it to GA4 + Ads.

export interface Attribution {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
  gclid?: string | null
  referrer?: string | null
  landing_page?: string | null
}

export function getAttribution(): Attribution {
  if (typeof document === 'undefined') return {}
  const entry = document.cookie
    .split('; ')
    .find((c) => c.startsWith('da_attribution='))
  if (!entry) return {}
  try {
    return JSON.parse(decodeURIComponent(entry.slice('da_attribution='.length)))
  } catch {
    return {}
  }
}

type DataLayer = Array<Record<string, unknown>>

function dataLayer(): DataLayer | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { dataLayer?: DataLayer }
  w.dataLayer = w.dataLayer || []
  return w.dataLayer
}

// Push the signup conversion into GTM's dataLayer on a confirmed signup. The
// `signup_completed` event matches the GTM container's "Sign Up Form Submission"
// trigger (NEXT_PUBLIC_GTM_ID), which forwards it to GA4 + the Google Ads
// conversion. Carries the first-touch attribution so those tags (and any others
// in the container) can use it. No-ops server-side; harmless when GTM isn't
// loaded — the push just buffers in the array.
export function pushSignupEvent(): void {
  const dl = dataLayer()
  if (!dl) return
  dl.push({ event: 'signup_completed', ...getAttribution() })
}

// ── GA4 identity capture ────────────────────────────────────────────────────
// Read the GA4 first-party cookies so the ORIGINAL session's identity can be
// carried to the server and reused when the trial_signup conversion is sent at
// email-confirmation time — a different session entirely (see lib/ga4-mp.ts).
//
// Neither value identifies a person: both are random first-party cookie values
// written by GA4 itself.

export interface GaIds {
  ga_client_id?: string | null
  ga_session_id?: string | null
}

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const entry = document.cookie.split('; ').find((c) => c.startsWith(name + '='))
  return entry ? entry.slice(name.length + 1) : null
}

/**
 * `_ga` holds `GA1.1.<a>.<b>` and the client id is `<a>.<b>` — the version and
 * depth prefix are not part of it. Per-stream `_ga_<ID>` (the measurement id
 * minus its `G-`) holds the session id, in one of two shapes depending on GA4
 * version: `GS1.1.<session_id>.<n>...` or the newer `GS2.1.s<session_id>$o...`.
 * Both are handled; a parse miss returns null and the event still sends, just
 * without session attribution.
 */
export function getGaIds(measurementId?: string): GaIds {
  const out: GaIds = {}

  const ga = cookie('_ga')
  if (ga) {
    const parts = ga.split('.')
    if (parts.length >= 4) out.ga_client_id = `${parts[2]}.${parts[3]}`
  }

  const mid = (measurementId || process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || '').replace(/^G-/, '')
  if (mid) {
    const raw = cookie(`_ga_${mid}`)
    if (raw) {
      const seg = raw.split('.')[2] || ''
      // Newer containers prefix the session id with `s` and append $-delimited
      // fields; older ones store the bare number.
      const m = seg.match(/^s?(\d+)/)
      if (m) out.ga_session_id = m[1]
    }
  }
  return out
}

// ── form_start ──────────────────────────────────────────────────────────────
// Fired once per SESSION (not per mount) on first interaction with the trial
// form, matching GA4's own form_start semantics. Goes to the server, which
// forwards it to GA4 over the Measurement Protocol — GA4 receives form_start
// only that way, so there must be no GTM GA4 tag for it as well.
//
// sessionStorage, not a ref: a ref resets on every remount (route change, tab
// revisit), which would fire it several times in one session.
const FORM_START_KEY = 'da_ga4_form_start_sent'

export function sendFormStartOncePerSession(context?: { landing_page?: string | null }): void {
  if (typeof window === 'undefined') return
  try {
    if (window.sessionStorage.getItem(FORM_START_KEY)) return
    window.sessionStorage.setItem(FORM_START_KEY, '1')
  } catch {
    // Private mode / storage blocked: fall through and send. Sending twice is
    // far better than never measuring the step at all.
  }
  const ids = getGaIds()
  // Fire-and-forget with keepalive so it survives the user navigating away
  // mid-request; analytics must never delay or block the form.
  try {
    void fetch('/api/track/form-start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...ids,
        source_page: context?.landing_page || window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // never surface an analytics failure to the visitor
  }
}
