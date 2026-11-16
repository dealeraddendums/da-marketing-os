import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { isAdminAuthed } from '@/lib/reputation'
import { buildAuthUrl } from '@/lib/linkedin/oauth'
import { linkedinConfigured, linkedinMissingEnv, linkedinEnv, linkedinRedirectUri } from '@/lib/linkedin/config'

export const dynamic = 'force-dynamic'

/** GET /api/linkedin/oauth/start — admin-only; redirects to LinkedIn consent.
 *  Mirrors /api/google/oauth/start, including the canonical-host bounce. */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!linkedinConfigured) {
    return NextResponse.json(
      { error: 'LinkedIn OAuth is not configured', missing: linkedinMissingEnv() },
      { status: 503 },
    )
  }

  // Keep the whole flow on ONE host (see the Google start route for the full
  // story): the state cookie set below is what the callback authenticates on,
  // and LinkedIn always redirects to the registered www redirect_uri — a flow
  // started on another host would strand the cookie where the callback never
  // sees it.
  const canonicalHost = new URL(linkedinEnv.siteUrl).host
  const requestHost = req.headers.get('host') || ''
  if (requestHost && requestHost !== canonicalHost) {
    console.warn(
      `[linkedin-oauth] start reached on ${requestHost}; redirecting to canonical ${canonicalHost} so the state cookie and callback share a host`,
    )
    return NextResponse.redirect(`${linkedinEnv.siteUrl.replace(/\/$/, '')}/api/linkedin/oauth/start`)
  }

  // CSRF: random state echoed back by LinkedIn and compared in the callback.
  console.log(`[linkedin-oauth] start on ${requestHost} → redirect_uri ${linkedinRedirectUri()}`)
  const state = crypto.randomBytes(16).toString('hex')
  cookies().set('da_linkedin_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 600,
  })
  return NextResponse.redirect(buildAuthUrl(state))
}
