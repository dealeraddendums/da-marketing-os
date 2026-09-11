import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendGa4Event } from '@/lib/ga4-mp'

export const dynamic = 'force-dynamic'

/**
 * POST /api/track/form-start — forward a browser form_start to GA4.
 *
 * Public and unauthenticated by necessity (anonymous visitors fire it), so it
 * is deliberately incapable of doing anything interesting: it accepts only the
 * GA4 cookie ids plus a path, writes nothing to the database, and always
 * answers 204 regardless of outcome so it can never be used as an oracle.
 *
 * Rate-limited per IP — an open analytics endpoint is otherwise a free way to
 * inflate someone else's funnel numbers.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // Generous for a real visitor (who fires this once per session), tight
  // enough that a script cannot meaningfully pollute the funnel.
  if (!rateLimit(`formstart:${ip}`, 5, 60_000)) return new NextResponse(null, { status: 204 })

  const body = (await req.json().catch(() => null)) as {
    ga_client_id?: string; ga_session_id?: string; source_page?: string
  } | null

  // Only ever a same-origin path, and length-capped: this value is forwarded to
  // GA4 as an event parameter, so it must not become an injection vector for
  // arbitrary attacker-controlled strings.
  const rawPage = typeof body?.source_page === 'string' ? body.source_page : ''
  const sourcePage = /^\/[\w\-./]{0,120}$/.test(rawPage) ? rawPage : '/'

  await sendGa4Event({
    name: 'form_start',
    clientId: body?.ga_client_id || null,
    sessionId: body?.ga_session_id || null,
    fallbackSeed: `form_start:${ip}`,
    params: { source_page: sourcePage, form_id: 'trial_signup_form' },
  })

  return new NextResponse(null, { status: 204 })
}
