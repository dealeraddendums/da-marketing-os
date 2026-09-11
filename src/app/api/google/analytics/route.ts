import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { getConnectionStatus } from '@/lib/google/oauth'
import { fetchGa4Summary } from '@/lib/google/ga4'
import { ga4Configured, missingEnvFor } from '@/lib/google/config'
import { cached } from '@/lib/google/cache'
import { resolveRange } from '@/lib/google/range'

export const dynamic = 'force-dynamic'

/** GET /api/google/analytics?days=30[&refresh=1] */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const { startDate, endDate, days } = resolveRange(searchParams)
  const force = searchParams.get('refresh') === '1'

  const connection = await getConnectionStatus()
  if (!connection.connected || !ga4Configured) {
    return NextResponse.json({
      connected: false,
      reason: !connection.connected ? 'not-connected' : 'not-configured',
      missing: ga4Configured ? [] : missingEnvFor('ga4'),
      range: { startDate, endDate, days },
    })
  }

  try {
    const { value, cachedAt, fromCache } = await cached(
      `google:ga4:${startDate}:${endDate}`,
      async () => {
        const summary = await fetchGa4Summary(startDate, endDate)

        // funnel.signups used to be OVERWRITTEN here with the marketing_leads
        // row count, because GA4 had no signup event. That is no longer true —
        // trial_signup is sent at email confirmation (lib/ga4-mp.ts) — and the
        // override was doing real harm: under the funnel's "GA4" toggle it
        // presented a first-party number as if GA4 had measured it, and it
        // counted every lead ROW, including unconfirmed and bot submissions,
        // as a trial signup. GA4's own count now stands on the GA4 toggle.
        //
        // The first-party numbers ride alongside instead, so the panel can show
        // the reconciliation that started this whole exercise: what GA4 counted
        // vs. what actually happened. `confirmedLeads` is the honest
        // first-party definition of a trial signup under Layer 0 — a submitted
        // form is a lead, a confirmed one is a signup.
        const since = `${startDate}T00:00:00.000Z`
        const [{ count: leads }, { count: confirmedLeads }] = await Promise.all([
          supabase.from('marketing_leads')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', since),
          supabase.from('marketing_leads')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', since)
            .not('confirmed_at', 'is', null),
        ])
        summary.firstParty = { leads: leads ?? 0, confirmedLeads: confirmedLeads ?? 0 }
        return summary
      },
      { force },
    )
    return NextResponse.json({
      connected: true, range: { startDate, endDate, days },
      cachedAt, fromCache, data: value,
    })
  } catch (err) {
    return NextResponse.json(
      { connected: true, error: err instanceof Error ? err.message : 'GA4 request failed',
        range: { startDate, endDate, days } },
      { status: 502 },
    )
  }
}
