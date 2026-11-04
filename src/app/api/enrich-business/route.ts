// POST /api/enrich-business — signup-form business lookup (name + ZIP →
// corrected name, street address, city, state, phone).
//
// Server-side proxy (same pattern as /api/brands): the real lookup runs on DA
// Platform's POST /api/self-serve/enrich, which holds the Google Places key —
// no key ever reaches this box or the browser. When the platform has no match
// (or no key is configured anywhere), this degrades gracefully: smart
// title-case on the name (acronyms preserved — "smith cdjr" → "Smith CDJR")
// plus a free ZIP→city/state lookup (zippopotam.us), street address omitted.
//
// Every value returned here is a PREFILL the visitor can edit — nothing is
// stored by this route.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { smartTitleCase } from '@/lib/business-name'

export const dynamic = 'force-dynamic'

interface PlatformEnrich {
  configured?: boolean
  match?: {
    name: string
    street: string | null
    city: string | null
    state: string | null
    zip: string | null
    phone: string | null
    confidence: 'high' | 'review'
  } | null
  zipLocation?: { city: string | null; state: string | null } | null
}

async function zipCityState(zip: string): Promise<{ city: string | null; state: string | null }> {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(3000),
      cache: 'force-cache',
    })
    if (!res.ok) return { city: null, state: null }
    const j = (await res.json()) as { places?: { 'place name'?: string; 'state abbreviation'?: string }[] }
    const p = j.places?.[0]
    return { city: p?.['place name'] ?? null, state: p?.['state abbreviation'] ?? null }
  } catch {
    return { city: null, state: null }
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`enrich:${ip}`, 12, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: { name?: string; zip?: string; kind?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const name = (body.name ?? '').trim().slice(0, 120)
  const zip = (body.zip ?? '').trim().match(/^(\d{5})(-\d{4})?$/)?.[1] ?? null
  const kind = body.kind === 'partner' ? 'partner' : 'dealer'
  if (name.length < 3 || !zip) {
    return NextResponse.json({ error: 'name and a 5-digit zip are required' }, { status: 400 })
  }

  // 1 — the platform's Places-backed lookup (key stays on the platform box).
  const base = process.env.DA_PLATFORM_URL
  const key = process.env.SELF_SERVE_API_KEY
  let platform: PlatformEnrich | null = null
  if (base && key) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/self-serve/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key,
          ...(ip !== 'unknown' ? { 'X-Signup-Client-IP': ip } : {}),
        },
        body: JSON.stringify({ name, zip, kind }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) platform = (await res.json()) as PlatformEnrich
    } catch {
      // Lookup is a convenience — never fail the form over it.
    }
  }

  if (platform?.match) {
    const m = platform.match
    return NextResponse.json(
      {
        source: 'places',
        confidence: m.confidence,
        name: m.name,
        street: m.street,
        city: m.city,
        state: m.state,
        phone: m.phone,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // 2 — fallback: clean the name, resolve city/state from the ZIP, no street.
  const loc = platform?.zipLocation?.city
    ? { city: platform.zipLocation.city, state: platform.zipLocation.state }
    : await zipCityState(zip)
  return NextResponse.json(
    {
      source: 'fallback',
      confidence: null,
      name: smartTitleCase(name),
      street: null,
      city: loc.city,
      state: loc.state,
      phone: null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
