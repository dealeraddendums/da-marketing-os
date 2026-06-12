import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSignals, CTX_HEADERS } from '@/lib/context-key'

// Static map keys for fast lookup (no import needed in middleware edge runtime)
const STATIC_TERMS = new Set([
  'car dealer addendum software','vehicle addendum','dealer addendum','addendum software',
  'car addendum','buyers guide software','ftc buyers guide','used car buyers guide',
  'new car dealer addendum','franchise dealer addendum','used car dealer software',
  'independent dealer addendum','cpo vehicle info sheet','kia dealer addendum',
  'ford dealer addendum','toyota dealer addendum','honda dealer addendum',
  'chevy dealer addendum','nissan dealer addendum','ftc compliance car dealer',
  'dealer compliance software','dealeraddendums alternative','addendum software alternative',
  'vehicle description generator','vin scanner app','qr code lead generation car dealer',
  'dealer inventory feed',
])

function weightedPick(options: string[], weights: number[]): string {
  const r = Math.random()
  let cumulative = 0
  for (let i = 0; i < options.length; i++) {
    cumulative += weights[i]
    if (r < cumulative) return options[i]
  }
  return options[0]
}

// Returning visitor = first seen more than 30 minutes ago (da_fs cookie,
// set once below). The da_attribution cookie can't be used directly — it
// appears on the second pageview of the same session.
const SESSION_WINDOW_MS = 30 * 60 * 1000

export function middleware(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const utmTerm     = searchParams.get('utm_term')     || ''
  const utmCampaign = searchParams.get('utm_campaign') || ''
  const utmSource   = searchParams.get('utm_source')   || ''
  const utmMedium   = searchParams.get('utm_medium')   || ''

  // Matched keyword from the ad URL — Google's {keyword} ValueTrack is
  // templated into utm_term in our final URLs; also accept keyword/kw.
  const keyword =
    utmTerm || searchParams.get('keyword') || searchParams.get('kw') || ''

  const firstSeenRaw = request.cookies.get('da_fs')?.value
  const firstSeen = firstSeenRaw ? parseInt(firstSeenRaw, 10) : NaN
  const returning = Number.isFinite(firstSeen) && Date.now() - firstSeen > SESSION_WINDOW_MS

  const ctx = buildSignals({
    keyword,
    utmCampaign,
    userAgent: request.headers.get('user-agent') || '',
    returning,
  })

  // Dynamic Landing Engine context → REQUEST headers so server components
  // can read them via headers(). (Response headers are not visible to
  // headers() — that was the gap in the old implementation.)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CTX_HEADERS.contextKey, ctx.contextKey)
  requestHeaders.set(CTX_HEADERS.keyword, ctx.keyword)
  requestHeaders.set(CTX_HEADERS.cluster, ctx.keywordCluster)
  requestHeaders.set(CTX_HEADERS.dealerType, ctx.dealerType)
  requestHeaders.set(CTX_HEADERS.campaign, utmCampaign)
  requestHeaders.set(CTX_HEADERS.device, ctx.device)
  requestHeaders.set(CTX_HEADERS.returning, returning ? '1' : '0')

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (!firstSeenRaw) {
    response.cookies.set('da_fs', String(Date.now()), {
      maxAge: 60 * 60 * 24 * 90,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  }

  // First-touch traffic attribution — set once, persist ~90 days. Readable by
  // client JS (getAttribution) so signup forms can attach it, and by the server
  // /api/leads route as a fallback. Not httpOnly (non-sensitive) unlike the A/B
  // cookies below. Value is plain JSON — Next URL-encodes it on the wire and
  // decodes it back on request.cookies.get(); document.cookie is decoded client-side.
  if (!request.cookies.get('da_attribution')) {
    const attribution = {
      utm_source:   searchParams.get('utm_source')   || null,
      utm_medium:   searchParams.get('utm_medium')   || null,
      utm_campaign: searchParams.get('utm_campaign') || null,
      utm_term:     searchParams.get('utm_term')     || null,
      utm_content:  searchParams.get('utm_content')  || null,
      gclid:        searchParams.get('gclid')        || null,
      referrer:     request.headers.get('referer')   || null,
      landing_page: new URL(request.url).pathname,
    }
    response.cookies.set('da_attribution', JSON.stringify(attribution), {
      maxAge: 60 * 60 * 24 * 90,
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
    })
  }

  // Sticky copy A/B variant via cookie (generic / personalized / dealertype)
  const abCookie  = request.cookies.get('da_hero_ab')?.value
  const abVariant = abCookie ?? weightedPick(
    ['generic', 'personalized', 'dealertype'],
    [0.33, 0.34, 0.33]
  )
  if (!abCookie) {
    response.cookies.set('da_hero_ab', abVariant, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: 'lax',
    })
  }

  // Layout test retired 2026-06-12: everyone gets the new dynamic benefit hero
  // ('b'). LayoutA (legacy mirror) is parked, not deleted — to re-run a layout
  // test, restore the weightedPick here AND the cookie read in page.tsx.
  const layoutVariant = 'b'
  response.cookies.set('da_layout', 'b', {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax',
  })

  const normalizedTerm = utmTerm.toLowerCase().trim()
  const hasStaticMatch = STATIC_TERMS.has(normalizedTerm)

  // Legacy response headers (debug visibility via curl -I; pages read the
  // request headers above instead)
  response.headers.set('x-layout-variant', layoutVariant)
  response.headers.set('x-ab-variant',   abVariant)
  response.headers.set('x-utm-term',     utmTerm)
  response.headers.set('x-utm-campaign', utmCampaign)
  response.headers.set('x-utm-source',   utmSource)
  response.headers.set('x-utm-medium',   utmMedium)
  response.headers.set('x-dealer-type',  ctx.dealerType)
  response.headers.set('x-static-match', hasStaticMatch ? 'true' : 'false')
  response.headers.set('x-da-context-key', ctx.contextKey)

  return response
}

export const config = {
  matcher: ['/', '/lp/:path*'],
}
