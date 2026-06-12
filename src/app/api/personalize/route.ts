// Dynamic Landing Engine — background cache-warm endpoint.
//
// Fired (fire-and-forget) by the client AFTER first paint when the server
// rendered the static hero for a cold context. It never returns copy — the
// generated hero is only ever served server-side from hero_cache on the NEXT
// request in this context. That keeps first paint fast and makes the endpoint
// useless to scrapers.
//
// The context key is recomputed server-side from raw signals — a client
// cannot poison an arbitrary cache slot.

import { NextRequest, NextResponse } from 'next/server'
import { buildSignals } from '@/lib/context-key'
import { warmHero, killSwitchOn } from '@/lib/hero-engine'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 6, 60_000)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  if (killSwitchOn()) return NextResponse.json({ ok: true, skipped: 'kill_switch' })

  let body: { keyword?: string; utmCampaign?: string; returning?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 })
  }

  const keyword = (body.keyword || '').toString().slice(0, 200)
  if (!keyword.trim()) {
    return NextResponse.json({ ok: false, error: 'keyword required' }, { status: 400 })
  }

  const signals = buildSignals({
    keyword,
    utmCampaign: (body.utmCampaign || '').toString().slice(0, 200),
    userAgent: req.headers.get('user-agent') || '',
    returning: !!body.returning,
  })

  const result = await warmHero(signals)
  return NextResponse.json({ ok: true, ...result })
}
