import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import {
  AB_HOME_COOKIE, AB_SEEN_COOKIE, AB_INTERNAL_COOKIE,
  abHomeOff, incrementAbHomeStat, parseBucket,
} from '@/lib/ab-home'
import { abIsBot } from '@/lib/ab-bot'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ab/seen — the beacon that makes a visitor COUNT.
 *
 * Middleware assignment keeps serving the variants (and increments only the
 * raw assigned counter); the first-party "visitors" metric is incremented
 * here, because reaching this endpoint requires executing our JS
 * (AbAssignmentTracker fires it alongside the ab_assignment dataLayer push) —
 * which the crawlers inflating the counts never do.
 *
 * Deliberately boring, like /api/track/form-start: no body is read, the bucket
 * comes only from the server-set da_ab_home cookie, and the answer is always
 * 204 so it can't be used as an oracle. Guards, in order:
 *   - per-IP rate limit (a script can't pump the counter)
 *   - bot headers (UA regex / missing Accept-Language — belt over the
 *     middleware's braces, for a JS-capable crawler that landed pre-deploy)
 *   - da_ab_internal: team browsers (ever used a ?variant= preview) never count
 *   - da_ab_seen: one count per browser per 24h, enforced by cookie
 */
export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`abseen:${ip}`, 10, 60_000)) return done

  if (abIsBot(req.headers.get('user-agent'), req.headers.get('accept-language'))) return done
  if (abHomeOff()) return done // experiment ended — counters stay frozen

  const bucket = parseBucket(req.cookies.get(AB_HOME_COOKIE)?.value)
  if (!bucket) return done                                   // no assignment → nothing to count
  if (req.cookies.get(AB_INTERNAL_COOKIE)?.value) return done // team preview browser
  if (req.cookies.get(AB_SEEN_COOKIE)?.value) return done     // already counted today

  void incrementAbHomeStat(bucket, 'visitors')
  const counted = new NextResponse(null, { status: 204 })
  counted.cookies.set(AB_SEEN_COOKIE, '1', {
    maxAge: 60 * 60 * 24, // 24h — "once per cookie per 24h"
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
  })
  return counted
}
