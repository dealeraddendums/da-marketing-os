import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    await supabase.from('ab_events').insert({
      event_type:      body.event,
      ab_variant:      body.abVariant,
      layout_variant:  body.layoutVariant ?? 'b',
      utm_term:        body.utmTerm,
      utm_campaign:    body.utmCampaign,
      utm_source:      body.utmSource,
      headline:        body.headline,
      ai_generated:    body.aiGenerated ?? false,
      session_id:      body.sessionId,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('ab-track error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
