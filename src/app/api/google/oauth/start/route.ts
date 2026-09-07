import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { isAdminAuthed } from '@/lib/reputation'
import { buildAuthUrl } from '@/lib/google/oauth'
import { oauthConfigured, missingEnvFor, oauthRedirectUri, googleEnv } from '@/lib/google/config'

export const dynamic = 'force-dynamic'

/** GET /api/google/oauth/start — admin-only; redirects to Google consent. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!oauthConfigured) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured', missing: missingEnvFor('oauth') },
      { status: 503 },
    )
  }

  // Keep the whole flow on ONE host.
  //
  // The state cookie set below is what the callback authenticates on, and a
  // cookie set on one host is never sent to another. Google always redirects to
  // the registered redirect_uri (www), so a flow started on any other host —
  // the apex, say — would set the cookie somewhere the callback will never see
  // it, and the callback would reject a perfectly good code as a state
  // mismatch. Bounce to the canonical host BEFORE minting the state, so the
  // cookie is always written on the host that will receive the callback.
  const canonicalHost = new URL(googleEnv.siteUrl).host
  const requestHost = req.headers.get('host') || ''
  if (requestHost && requestHost !== canonicalHost) {
    console.warn(
      `[google-oauth] start reached on ${requestHost}; redirecting to canonical ${canonicalHost} so the state cookie and callback share a host`,
    )
    return NextResponse.redirect(`${googleEnv.siteUrl.replace(/\/$/, '')}/api/google/oauth/start`)
  }
  // CSRF: a random state echoed back by Google and compared in the callback, so
  // a forged callback cannot plant someone else's authorization code.
  console.log(`[google-oauth] start on ${requestHost} → redirect_uri ${oauthRedirectUri()}`)
  const state = crypto.randomBytes(16).toString('hex')
  cookies().set('da_google_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 600,
  })
  return NextResponse.redirect(buildAuthUrl(state))
}
