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
