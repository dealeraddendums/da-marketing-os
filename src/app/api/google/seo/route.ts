import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import { fetchGscSummary, listSites } from '@/lib/google/gsc'
import { gscConfigured, googleEnv, surfaceGranted } from '@/lib/google/config'
import { cached } from '@/lib/google/cache'
import { resolveRange } from '@/lib/google/range'

export const dynamic = 'force-dynamic'

/** GET /api/google/seo?days=30[&refresh=1] — Search Console. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const { startDate, endDate, days } = resolveRange(searchParams)
  const force = searchParams.get('refresh') === '1'
  const range = { startDate, endDate, days }

  const connection = await getConnectionStatus()
  if (!connection.connected || !gscConfigured) {
    return NextResponse.json({
      connected: false,
      reason: !connection.connected ? 'not-connected' : 'not-configured',
      needsReconnect: !!connection.needsReconnect,
      range,
    })
  }
  if (!surfaceGranted('gsc', connection.scopes ?? [])) {
    return NextResponse.json({
      connected: false, reason: 'missing-scope', needsScopeUpgrade: true,
      detail: 'This Google connection was authorized without a Search Console (webmasters) scope. Reconnect to grant it.',
      range,
    })
  }

  try {
    const { value, cachedAt, fromCache } = await cached(
      `google:gsc:${startDate}:${endDate}`,
      () => fetchGscSummary(startDate, endDate),
      { force },
    )
    return NextResponse.json({
      connected: true,
      // The property actually queried, which may differ from GSC_SITE_URL when
      // that value does not exist in the account (see gsc.ts resolveSite).
      site: value.site,
      resolvedFrom: value.resolvedFrom,
      configuredSite: googleEnv.gscSiteUrl || null,
      range, cachedAt, fromCache, data: value,
    })
  } catch (err) {
    // A property mismatch is the likeliest cause, and it is only actionable if
    // the operator can see what the account actually has — so the available
    // list rides along with the error.
    let available: { siteUrl: string; permissionLevel: string }[] = []
    try { available = await listSites() } catch { /* the real error is below */ }
    return NextResponse.json(
      {
        connected: true,
        error: err instanceof Error ? err.message : 'Search Console request failed',
        configuredSite: googleEnv.gscSiteUrl || null,
        availableSites: available,
        range,
      },
      { status: 502 },
    )
  }
}
