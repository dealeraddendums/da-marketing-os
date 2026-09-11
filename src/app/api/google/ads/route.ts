import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import {
  campaignReport, customerInfo, listAdsAccounts, AdsError,
} from '@/lib/google/ads'
import { adsConfigured, googleEnv, normalizeCustomerId, surfaceGranted } from '@/lib/google/config'
import { cached } from '@/lib/google/cache'
import { resolveRange } from '@/lib/google/range'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/ads?days=30[&customerId=...][&loginCustomerId=...][&refresh=1]
 *
 * READ-ONLY campaign reporting. There is no POST/PUT here by design: Ads writes
 * are Phase 2 and go through the proposed_changes approval queue.
 *
 * With no customerId, the account is chosen for you: GOOGLE_ADS_CUSTOMER_ID if
 * it is actually accessible, else the single non-manager account, else nothing
 * (and the panel shows the picker). A manager account is never auto-selected —
 * an MCC has no campaigns of its own, so reporting on it would render an empty
 * table that looks like a failure.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const { startDate, endDate, days } = resolveRange(searchParams)
  const force = searchParams.get('refresh') === '1'
  const range = { startDate, endDate, days }

  const connection = await getConnectionStatus()
  if (!connection.connected || !adsConfigured) {
    return NextResponse.json({
      connected: false,
      reason: !connection.connected ? 'not-connected' : 'not-configured',
      needsReconnect: !!connection.needsReconnect,
      range,
    })
  }
  // The adwords scope is the one thing a reconnect can fix, so it is reported
  // distinctly from every other failure.
  if (!surfaceGranted('ads', connection.scopes ?? [])) {
    return NextResponse.json({
      connected: false, reason: 'missing-scope', needsScopeUpgrade: true,
      detail: 'This Google connection was authorized without the Google Ads (adwords) scope. Reconnect to grant it.',
      range,
    })
  }

  const requested = normalizeCustomerId(searchParams.get('customerId') || '')
  const requestedLogin = normalizeCustomerId(searchParams.get('loginCustomerId') || '')

  try {
    // Account list is cached separately from the report: it changes rarely, and
    // the picker needs it on every render.
    const { value: accountList } = await cached(
      'google:ads:accounts', () => listAdsAccounts(), { force },
    )
    const accounts = accountList.accounts

    let customerId = requested
    let loginCustomerId = requestedLogin

    if (!customerId) {
      const preferred = normalizeCustomerId(googleEnv.adsCustomerId)
      const spenders = accounts.filter(a => !a.manager)
      const pick =
        spenders.find(a => a.id === preferred) ||
        (spenders.length === 1 ? spenders[0] : undefined)
      if (pick) {
        customerId = pick.id
        loginCustomerId = pick.viaManager || ''
      }
    } else if (!loginCustomerId) {
      // Derive the manager header from the discovered hierarchy rather than
      // from env: a login-customer-id the grant cannot access fails every call.
      const known = accounts.find(a => a.id === customerId)
      if (known?.viaManager) loginCustomerId = known.viaManager
    }

    if (!customerId) {
      return NextResponse.json({
        connected: true, needsAccountChoice: true,
        accounts, problems: accountList.problems, range,
      })
    }

    const known = accounts.find(a => a.id === customerId)
    const { value, cachedAt, fromCache } = await cached(
      `google:ads:report:${customerId}:${startDate}:${endDate}`,
      async () => {
        const info = known ?? await customerInfo(customerId, loginCustomerId || undefined)
        return campaignReport(
          customerId, startDate, endDate,
          loginCustomerId || undefined, info?.currency || 'USD',
        )
      },
      { force },
    )

    return NextResponse.json({
      connected: true,
      customerId,
      customerName: known?.name || customerId,
      accounts,
      problems: accountList.problems,
      range, cachedAt, fromCache,
      data: value,
    })
  } catch (err) {
    if (err instanceof AdsError) {
      // These are configuration/permission states, not faults in this app, so
      // they answer 200 with a readable shape and the panel renders a calm
      // message instead of a red error.
      return NextResponse.json({
        connected: false,
        reason: err.kind,
        apiNotEnabled: err.kind === 'api-not-enabled',
        detail: err.message,
        requestId: err.requestId ?? null,
        range,
      })
    }
    return NextResponse.json(
      { connected: true, error: err instanceof Error ? err.message : 'Google Ads request failed', range },
      { status: 502 },
    )
  }
}
