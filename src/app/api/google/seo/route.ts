import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import { fetchGscSummary } from '@/lib/google/gsc'
import { gscConfigured, missingEnvFor, googleEnv } from '@/lib/google/config'
import { cached } from '@/lib/google/cache'
import { resolveRange } from '@/lib/google/range'

export const dynamic = 'force-dynamic'

/** GET /api/google/seo?days=30[&refresh=1] — Search Console. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const { startDate, endDate, days } = resolveRange(searchParams)
  const force = searchParams.get('refresh') === '1'

  const connection = await getConnectionStatus()
  if (!connection.connected || !gscConfigured) {
    return NextResponse.json({
      connected: false,
      reason: !connection.connected ? 'not-connected' : 'not-configured',
      missing: gscConfigured ? [] : missingEnvFor('gsc'),
      range: { startDate, endDate, days },
    })
  }

  try {
    const { value, cachedAt, fromCache } = await cached(
      `google:gsc:${startDate}:${endDate}`,
      () => fetchGscSummary(startDate, endDate),
      { force },
    )
    return NextResponse.json({
      connected: true, site: googleEnv.gscSiteUrl,
      range: { startDate, endDate, days }, cachedAt, fromCache, data: value,
    })
  } catch (err) {
    return NextResponse.json(
      { connected: true, error: err instanceof Error ? err.message : 'Search Console request failed',
        range: { startDate, endDate, days } },
      { status: 502 },
    )
  }
}
