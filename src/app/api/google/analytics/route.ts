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
        // Signups come from marketing_leads, not GA4: the lead table is the
        // authoritative record of a trial signup, and GA4 would only know about
        // it if a conversion event happened to be configured for it.
        const { count } = await supabase
          .from('marketing_leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', `${startDate}T00:00:00.000Z`)
        summary.funnel.signups = count ?? 0
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
