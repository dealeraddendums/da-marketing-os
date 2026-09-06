import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { isAdminAuthed } from '@/lib/reputation'
import { buildAuthUrl, } from '@/lib/google/oauth'
import { oauthConfigured, missingEnvFor } from '@/lib/google/config'

export const dynamic = 'force-dynamic'

/** GET /api/google/oauth/start — admin-only; redirects to Google consent. */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!oauthConfigured) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured', missing: missingEnvFor('oauth') },
      { status: 503 },
    )
  }
  // CSRF: a random state echoed back by Google and compared in the callback, so
  // a forged callback cannot plant someone else's authorization code.
  const state = crypto.randomBytes(16).toString('hex')
  cookies().set('da_google_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 600,
  })
  return NextResponse.redirect(buildAuthUrl(state))
}
