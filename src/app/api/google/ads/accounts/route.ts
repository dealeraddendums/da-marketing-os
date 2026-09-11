import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import { listAdsAccounts, AdsError } from '@/lib/google/ads'
import { adsConfigured, surfaceGranted } from '@/lib/google/config'
import { cached } from '@/lib/google/cache'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/ads/accounts[?refresh=1] — every Google Ads account this
 * connection can reach, with manager accounts expanded into their children.
 *
 * Separate from /api/google/ads so the picker can refresh the account list
 * without re-running a campaign report, and so an account that fails does not
 * hide the ones that work (see `problems`).
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const force = new URL(req.url).searchParams.get('refresh') === '1'
  const connection = await getConnectionStatus()
  if (!connection.connected || !adsConfigured) {
    return NextResponse.json({
      connected: false,
      reason: !connection.connected ? 'not-connected' : 'not-configured',
      needsReconnect: !!connection.needsReconnect,
    })
  }
  if (!surfaceGranted('ads', connection.scopes ?? [])) {
    return NextResponse.json({
      connected: false, reason: 'missing-scope', needsScopeUpgrade: true,
      detail: 'This connection lacks the Google Ads (adwords) scope. Reconnect to grant it.',
    })
  }

  try {
    const { value, cachedAt, fromCache } = await cached(
      'google:ads:accounts', () => listAdsAccounts(), { force },
    )
    return NextResponse.json({ connected: true, cachedAt, fromCache, ...value })
  } catch (err) {
    if (err instanceof AdsError) {
      return NextResponse.json({
        connected: false, reason: err.kind,
        apiNotEnabled: err.kind === 'api-not-enabled',
        detail: err.message, requestId: err.requestId ?? null,
      })
    }
    return NextResponse.json(
      { connected: true, error: err instanceof Error ? err.message : 'Google Ads request failed' },
      { status: 502 },
    )
  }
}
