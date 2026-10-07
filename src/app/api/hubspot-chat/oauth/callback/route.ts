import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeAndStore } from '@/lib/hubspot-chat/oauth'
import { oauthConfigured, hubspotChatEnv } from '@/lib/hubspot-chat/config'

export const dynamic = 'force-dynamic'
// Next 14 still caches supabase-js GETs in the Data Cache under force-dynamic: a
// poll that once read "no new messages" kept getting that answer forever, so
// agent replies never reached the widget. Every chat read must be live.
export const fetchCache = 'force-no-store'

/**
 * GET /api/hubspot-chat/oauth/callback — the app's registered redirect URL.
 *
 * Two ways in, both legitimate:
 *  - from /api/hubspot-chat/oauth/start (admin-gated) → carries `state`, which
 *    must match the httpOnly cookie that route set;
 *  - from HubSpot's own "Install" button on the app's Distribution tab → no
 *    state at all. That install can only be completed by someone who can
 *    consent in a HubSpot portal, and exchangeCodeAndStore() refuses any grant
 *    whose hub_id is not 23896347 — so a stranger installing our private app
 *    into their own portal stores nothing.
 * A state that is present but wrong is always rejected.
 */
export async function GET(req: NextRequest) {
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${hubspotChatEnv.siteUrl.replace(/\/$/, '')}/admin?${new URLSearchParams(params)}`)

  if (!oauthConfigured) return back({ hubspot_chat: 'error', reason: 'not-configured' })
  const url = new URL(req.url)
  const error = url.searchParams.get('error')
  if (error) return back({ hubspot_chat: 'error', reason: error })

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = cookies().get('da_hubspot_chat_oauth_state')?.value
  cookies().delete('da_hubspot_chat_oauth_state')
  if (!code) return back({ hubspot_chat: 'error', reason: 'no-code' })
  if (state && state !== expected) {
    console.warn('[hubspot-chat-oauth] state mismatch — rejected')
    return back({ hubspot_chat: 'error', reason: 'state-mismatch' })
  }

  try {
    const { portalId } = await exchangeCodeAndStore(code)
    console.log(`[hubspot-chat-oauth] connected to portal ${portalId}`)
    return back({ hubspot_chat: 'connected' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'exchange-failed'
    console.error('[hubspot-chat-oauth] code exchange failed:', message)
    return back({ hubspot_chat: 'error', reason: message })
  }
}
