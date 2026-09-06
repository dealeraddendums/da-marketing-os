import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import { fetchAdsSummary, AdsAccessPendingError } from '@/lib/google/ads'
import { adsConfigured, missingEnvFor, googleEnv } from '@/lib/google/config'
import { cached } from '@/lib/google/cache'
import { resolveRange } from '@/lib/google/range'

export const dynamic = 'force-dynamic'

/** GET /api/google/ads?days=30[&refresh=1] — READ-ONLY campaign reporting.
 *  There is no POST/PUT here by design: Ads writes are Phase 2 and go through
 *  the proposed_changes approval queue. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const { startDate, endDate, days } = resolveRange(searchParams)
  const force = searchParams.get('refresh') === '1'

  const connection = await getConnectionStatus()
  if (!connection.connected || !adsConfigured) {
    return NextResponse.json({
      connected: false,
      reason: !connection.connected ? 'not-connected' : 'not-configured',
      missing: adsConfigured ? [] : missingEnvFor('ads'),
      awaitingDeveloperToken: !googleEnv.adsDeveloperToken,
      range: { startDate, endDate, days },
    })
  }

  try {
    const { value, cachedAt, fromCache } = await cached(
      `google:ads:${startDate}:${endDate}`,
      () => fetchAdsSummary(startDate, endDate),
      { force },
    )
    return NextResponse.json({
      connected: true, customerId: googleEnv.adsCustomerId,
      range: { startDate, endDate, days }, cachedAt, fromCache, data: value,
    })
  } catch (err) {
    // Test-level developer token refused for the production account: an
    // expected waiting state, so answer 200 with a clean "awaiting approval"
    // shape rather than a 502 the panel would render as a fault.
    if (err instanceof AdsAccessPendingError) {
      return NextResponse.json({
        connected: false,
        reason: 'awaiting-basic-access',
        awaitingBasicAccess: true,
        code: err.code,
        detail: err.message,
        range: { startDate, endDate, days },
      })
    }
    return NextResponse.json(
      { connected: true, error: err instanceof Error ? err.message : 'Google Ads request failed',
        range: { startDate, endDate, days } },
      { status: 502 },
    )
  }
}
