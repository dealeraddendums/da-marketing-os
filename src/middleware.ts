import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildSignals, CTX_HEADERS } from '@/lib/context-key'
import { parseHeroVariant, HERO_CONTROL } from '@/lib/ab-variants'
import { abIsBot } from '@/lib/ab-bot'

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

// ── Home B layout A/B (homepage "/" only) ────────────────────────────────────
// Server-side bucketing — the page renders the chosen variant directly off the
// x-ab-home request header, so there is no client-side variant flip/flicker.
// Names + semantics mirror src/lib/ab-home.ts (middleware is edge runtime, so
// it can't import that module's supabase dependency — keep the two in sync).
const AB_HOME_COOKIE = 'da_ab_home'
const AB_HOME_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
// Known bots always get A and never get a cookie: crawlers must index the
// stable control, and their traffic must not dilute the experiment counters.
// Googlebot/bingbot/duckduckbot etc. all match /bot/. Widened 2026-11-15:
// a 24h nginx-log audit showed ~81% of assigned "visitors" were uptime
// monitors (StackMonitor ~1,400 hits/day, KibaPublicMonitor, Infrawatch) and
// CLI tools (curl/python/wget) that keep no cookies, so each hit minted a new
// visitor. "monitor|uptime|scan" + the HTTP-client tokens catch them; no real
// browser UA contains any of these.
// Bot classification moved to lib/ab-bot.ts (shared with /api/ab/seen).

function abHomeBPct(): number {
  const n = parseInt(process.env.AB_HOME_B_PCT || '0', 10)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

// ── Blog archive / rename routing ────────────────────────────────────────────
// Middleware can't read content/posts (edge runtime, no fs), so it consults
// /api/blog-archive-map and caches the result in module scope for 60s.
//   moved[old] = new slug                → 301 (renamed published post)
//   archived[slug] = replacement | null  → 301 to replacement, or REWRITE to
//     /api/blog-retired/<slug> which answers a true 410 Gone.
// On any fetch failure the request passes through — the /blog/[slug] page has
// a same-shaped fallback (redirect / notFound), so nothing breaks.
interface BlogRouteMap {
  moved: Record<string, string>
  archived: Record<string, string | null>
}
let blogMapCache: { map: BlogRouteMap; at: number } | null = null

async function blogRouteMap(request: NextRequest): Promise<BlogRouteMap | null> {
  if (blogMapCache && Date.now() - blogMapCache.at < 60_000) return blogMapCache.map
  // Fetch from the local server, not the public origin: the box cannot
  // reliably reach its own public https URL from inside middleware (verified
  // live 2026-11-09 — the public-origin fetch failed while localhost worked),
  // and middleware runs in the same `next start` process as the route anyway.
  const origins = [
    `http://127.0.0.1:${process.env.PORT || '3020'}/api/blog-archive-map`,
    new URL('/api/blog-archive-map', request.url).toString(),
  ]
  for (const origin of origins) {
    try {
      const res = await fetch(origin, { headers: { 'x-middleware-fetch': '1' } })
      if (!res.ok) continue
      const map = (await res.json()) as BlogRouteMap
      blogMapCache = { map, at: Date.now() }
      return map
    } catch { /* try the next origin */ }
  }
  return blogMapCache?.map ?? null
}

async function handleBlogPath(request: NextRequest): Promise<NextResponse | null> {
  const slug = request.nextUrl.pathname.replace(/^\/blog\//, '').replace(/\/$/, '')
  if (!slug || slug.includes('/')) return null
  const map = await blogRouteMap(request)
  if (!map) return null
  if (map.moved[slug]) {
    return NextResponse.redirect(new URL(`/blog/${map.moved[slug]}`, request.url), 301)
  }
  if (slug in map.archived) {
    const target = map.archived[slug]
    if (target) return NextResponse.redirect(new URL(`/blog/${target}`, request.url), 301)
    return NextResponse.rewrite(new URL(`/api/blog-retired/${slug}`, request.url))
  }
  return null
}

export async function middleware(request: NextRequest) {
  // Blog posts: only archive/rename routing, none of the landing-page
  // attribution logic below (which was always scoped to / and /lp).
  if (request.nextUrl.pathname.startsWith('/blog/')) {
    return (await handleBlogPath(request)) ?? NextResponse.next()
  }
  const { searchParams } = new URL(request.url)

  // ── Home B bucketing — "/" only ────────────────────────────────────────────
  const isHome = request.nextUrl.pathname === '/'
  let abHome: 'A' | 'B' = 'A'
  let abHomeAssigned = false // just assigned this request → set cookie + count a visitor
  if (isHome) {
    const ua = request.headers.get('user-agent') || ''
    // Bot = empty UA, UA-regex match, or no Accept-Language header (every real
    // browser sends one on a document navigation; the crawlers that carry a
    // perfect Chrome UA string usually don't). See lib/ab-bot.ts.
    const isBot = abIsBot(ua, request.headers.get('accept-language'))

    // Team preview: /?variant=A|B pins the cookie and redirects back to /
    // without the variant param (other params, e.g. UTMs, are preserved so a
    // tagged preview link doesn't lose attribution). Ignored for bots.
    const variantParam = (searchParams.get('variant') || '').toUpperCase()
    if (!isBot && (variantParam === 'A' || variantParam === 'B')) {
      const url = request.nextUrl.clone()
      url.searchParams.delete('variant')
      const redirect = NextResponse.redirect(url)
      redirect.cookies.set(AB_HOME_COOKIE, variantParam, {
        maxAge: AB_HOME_COOKIE_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
      // Mark this browser internal for 30 days: a teammate who has ever used a
      // ?variant= preview must not be counted by the /api/ab/seen beacon — not
      // on the preview, and not on their ordinary visits afterwards.
      redirect.cookies.set('da_ab_internal', '1', {
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      })
      return redirect
    }

    if (!isBot) {
      // AB_HOME_B_PCT=0 = the experiment is off (ended or not started): every
      // non-team browser sees the control, INCLUDING ones still carrying an old
      // B cookie, and nothing is assigned or counted — the recorded results
      // stay frozen. Team browsers (da_ab_internal, set by ?variant= previews)
      // keep cookie behavior so /?variant=B still previews Home B.
      const internal = request.cookies.get('da_ab_internal')?.value === '1'
      if (abHomeBPct() === 0 && !internal) {
        abHome = 'A'
      } else {
        const existing = request.cookies.get(AB_HOME_COOKIE)?.value
        if (existing === 'A' || existing === 'B') {
          abHome = existing
        } else {
          abHome = Math.random() * 100 < abHomeBPct() ? 'B' : 'A'
          abHomeAssigned = true
        }
      }
    }
    // Bots: abHome stays 'A', no cookie, no visitor count.
  }

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
  // Never trust client-sent copies of the A/B headers — x-ab-home-new drives a
  // first-party counter, so a spoofed value would inflate it.
  requestHeaders.delete('x-ab-home')
  requestHeaders.delete('x-ab-home-new')
  if (isHome) {
    requestHeaders.set('x-ab-home', abHome)
    // Only on the request that first assigned a bucket — the homepage
    // increments the first-party visitors counter off this flag.
    if (abHomeAssigned) requestHeaders.set('x-ab-home-new', '1')
  }

  // Sticky copy A/B variant via cookie (generic / personalized / dealertype).
  // The cookie is attacker-controlled input: only the defined arms are
  // accepted. A present-but-unrecognized value (scanner probes were persisted
  // as "variants" via this path until 2026-11-15) falls back to CONTROL and
  // the cookie is overwritten, so the junk value never propagates anywhere.
  // Computed BEFORE the response exists so the assigned arm rides a REQUEST
  // header: the page cannot read this response's own Set-Cookie during the
  // same render, so without the header every visitor's FIRST pageview fell
  // back to 'personalized' regardless of assignment, inflating that arm.
  const abCookieRaw = request.cookies.get('da_hero_ab')?.value
  const abCookie    = parseHeroVariant(abCookieRaw)
  const abVariant   = abCookie ?? (abCookieRaw ? HERO_CONTROL : weightedPick(
    ['generic', 'personalized', 'dealertype'],
    [0.33, 0.34, 0.33]
  ))
  requestHeaders.delete('x-ab-hero')
  requestHeaders.set('x-ab-hero', abVariant)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  if (isHome && abHomeAssigned) {
    response.cookies.set(AB_HOME_COOKIE, abHome, {
      maxAge: AB_HOME_COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  }

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

  // Persist the arm assigned above (header block before the response).
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
  // /blog/:path* is ONLY for archive/rename routing (301/410) — the function
  // returns before any attribution/AB logic runs on blog paths.
  matcher: ['/', '/lp/:path*', '/blog/:path*'],
}
