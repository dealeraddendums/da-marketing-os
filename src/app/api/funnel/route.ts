import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/funnel — conversion funnel, last 30 days. Admin-only.
 *
 * All stage counts come from ab_events (same pipe as hero_impression), keyed
 * by event_type — raw per-visit-guarded counts, not distinct sessions:
 *   • visitors     = hero_impression
 *   • engaged      = engaged_30s     (30s on the hero)
 *   • pricingViewed= pricing_view    (pricing section ≥50% in view)
 *   • formStarted  = form_start      (signup form focused)
 *   • trialSignups = marketing_leads rows
 *   • converted    = null — trial→paid lives in da-billing, not here.
 */
export async function GET() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const countEvent = async (eventType: string) => {
    const { count, error } = await supabase
      .from('ab_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', eventType)
      .gte('created_at', thirtyDaysAgo)
    if (error) throw error
    return count ?? 0
  }

  try {
    const [visitors, engaged, pricingViewed, formStarted] = await Promise.all([
      countEvent('hero_impression'),
      countEvent('engaged_30s'),
      countEvent('pricing_view'),
      countEvent('form_start'),
    ])

    const { count: trialSignups, error: tErr } = await supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
    if (tErr) throw tErr

    // Converted = marketing-attributed trial→paid in the last 30 days. Rolling
    // count (converted_at-based), not a same-cohort rate — trial→paid lags
    // signup by up to the trial length. See converted-join.md.
    const { count: converted, error: cErr } = await supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'converted')
      .gte('converted_at', thirtyDaysAgo)
    if (cErr) throw cErr

    return NextResponse.json({
      visitors,
      engaged,
      pricingViewed,
      formStarted,
      trialSignups: trialSignups ?? 0,
      converted: converted ?? 0,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'funnel query failed' },
      { status: 500 },
    )
  }
}
