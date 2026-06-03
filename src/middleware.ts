import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

const MAKE_REGEX = /kia|ford|toyota|honda|chevy|chevrolet|nissan|gm|bmw|mercedes|audi|hyundai|subaru|mazda|jeep|dodge|ram/i

function detectDealerType(text: string): string {
  const t = text.toLowerCase()
  const makeMatch = t.match(MAKE_REGEX)
  if (makeMatch) return makeMatch[0] === 'chevy' ? 'chevrolet' : makeMatch[0]
  if (t.match(/used|independent|cpo|certified/)) return 'used-car'
  if (t.match(/franchise|group|multi|rooftop/)) return 'franchise'
  if (t.match(/ftc|compliance|buyers guide/)) return 'compliance'
  if (t.match(/ios|app|mobile|scan|vin/)) return 'mobile'
  return 'general'
}

function weightedPick(options: string[], weights: number[]): string {
  const r = Math.random()
  let cumulative = 0
  for (let i = 0; i < options.length; i++) {
    cumulative += weights[i]
    if (r < cumulative) return options[i]
  }
  return options[0]
}

export function middleware(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const response = NextResponse.next()

  const utmTerm     = searchParams.get('utm_term')     || ''
  const utmCampaign = searchParams.get('utm_campaign') || ''
  const utmSource   = searchParams.get('utm_source')   || ''
  const utmMedium   = searchParams.get('utm_medium')   || ''

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

  // Sticky layout A/B/C variant via cookie (a = classic/current-site, b = new design)
  const layoutCookie  = request.cookies.get('da_layout')?.value
  const layoutVariant = layoutCookie ?? weightedPick(['a', 'b'], [0.50, 0.50])
  if (!layoutCookie) {
    response.cookies.set('da_layout', layoutVariant, {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: 'lax',
    })
  }

  const normalizedTerm = utmTerm.toLowerCase().trim()
  const dealerType     = detectDealerType(utmTerm + ' ' + utmCampaign)
  const hasStaticMatch = STATIC_TERMS.has(normalizedTerm)

  // Pass context to page via headers
  response.headers.set('x-layout-variant', layoutVariant)
  response.headers.set('x-ab-variant',   abVariant)
  response.headers.set('x-utm-term',     utmTerm)
  response.headers.set('x-utm-campaign', utmCampaign)
  response.headers.set('x-utm-source',   utmSource)
  response.headers.set('x-utm-medium',   utmMedium)
  response.headers.set('x-dealer-type',  dealerType)
  response.headers.set('x-static-match', hasStaticMatch ? 'true' : 'false')
  response.headers.set('x-needs-ai',
    (!hasStaticMatch && !!utmTerm && abVariant !== 'generic').toString()
  )

  return response
}

export const config = {
  matcher: ['/', '/lp/:path*'],
}
