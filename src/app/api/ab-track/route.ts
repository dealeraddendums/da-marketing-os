import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  AB_EVENT_TYPES, AB_EVENT_VARIANTS, AB_LAYOUT_VARIANTS, inSet,
} from '@/lib/ab-variants'

// This endpoint is public and unauthenticated (it is called fire-and-forget
// from page JS), which makes it the write gate for ab_events: on 2026-10-26 a
// scanner persisted dozens of SQL-probe strings as "variants" through it.
// Whitelists now apply to every enumerated field — an unknown variant/layout
// is dropped to null (never written), an unknown event_type means the row is
// not written at all. The queries themselves were always parameterized
// (supabase-js → PostgREST, values bound as data), so the probes never
// executed; they only polluted the dataset.

const cap = (v: unknown, max = 300): string | null =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Unknown event name → not a real funnel event; nothing to record.
    const eventType = inSet(body.event, AB_EVENT_TYPES)
    if (!eventType) return NextResponse.json({ ok: true })

    await supabase.from('ab_events').insert({
      event_type:      eventType,
      ab_variant:      inSet(body.abVariant, AB_EVENT_VARIANTS),
      layout_variant:  inSet(body.layoutVariant, AB_LAYOUT_VARIANTS) ?? 'b',
      utm_term:        cap(body.utmTerm),
      utm_campaign:    cap(body.utmCampaign),
      utm_source:      cap(body.utmSource),
      headline:        cap(body.headline),
      ai_generated:    body.aiGenerated === true,
      session_id:      cap(body.sessionId, 100),
      context_key:     cap(body.contextKey, 200),
      variation_id:    cap(body.variationId, 200),
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('ab-track error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
