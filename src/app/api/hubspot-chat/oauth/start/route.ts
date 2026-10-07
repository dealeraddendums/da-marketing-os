import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { isAdminAuthed } from '@/lib/reputation'
import { buildAuthUrl } from '@/lib/hubspot-chat/oauth'
import { oauthConfigured, hubspotChatEnv } from '@/lib/hubspot-chat/config'

export const dynamic = 'force-dynamic'
// Next 14 still caches supabase-js GETs in the Data Cache under force-dynamic: a
// poll that once read "no new messages" kept getting that answer forever, so
// agent replies never reached the widget. Every chat read must be live.
export const fetchCache = 'force-no-store'

/** GET /api/hubspot-chat/oauth/start — admin-only; sends a Super Admin to the
 *  HubSpot consent screen for the Steven Chat Bridge app (portal-pinned). */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!oauthConfigured) return NextResponse.json({ error: 'HubSpot chat app is not configured' }, { status: 503 })

  // Same one-host rule as the Google flow: the state cookie must be written on
  // the host HubSpot redirects back to.
  const canonicalHost = new URL(hubspotChatEnv.siteUrl).host
  const requestHost = req.headers.get('host') || ''
  if (requestHost && requestHost !== canonicalHost) {
    return NextResponse.redirect(`${hubspotChatEnv.siteUrl.replace(/\/$/, '')}/api/hubspot-chat/oauth/start`)
  }

  const state = crypto.randomBytes(16).toString('hex')
  cookies().set('da_hubspot_chat_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 600,
  })
  return NextResponse.redirect(buildAuthUrl(state))
}
