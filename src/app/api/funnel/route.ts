import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/funnel — honest conversion funnel, last 30 days.
 *
 * Only the steps we actually have an event source for are returned with a
 * number:
 *   • visitors      = ab_events where event_type='hero_impression'
 *   • trialSignups  = marketing_leads rows
 *   • converted     = null — trial→paid lives in da-billing, not the
 *                     marketing Supabase, so it's "not tracked" here for now.
 *
 * Engaged(30s+) / Pricing Viewed / Form Started have NO event source yet
 * (need dedicated PostHog events) — the client renders them as "not tracked
 * yet" rather than inventing numbers, so nothing is returned for them.
 */
export async function GET() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { count: visitors, error: vErr } = await supabase
      .from('ab_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'hero_impression')
      .gte('created_at', thirtyDaysAgo)
    if (vErr) throw vErr

    const { count: trialSignups, error: tErr } = await supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
    if (tErr) throw tErr

    return NextResponse.json({
      visitors: visitors ?? 0,
      trialSignups: trialSignups ?? 0,
      converted: null, // not tracked in marketing Supabase (lives in da-billing)
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'funnel query failed' },
      { status: 500 },
    )
  }
}
