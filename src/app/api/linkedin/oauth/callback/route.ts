import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeAndStore } from '@/lib/linkedin/oauth'
import { linkedinConfigured, linkedinEnv } from '@/lib/linkedin/config'

export const dynamic = 'force-dynamic'

/**
 * GET /api/linkedin/oauth/callback — the redirect URL registered in the
 * LinkedIn developer app:
 *   https://www.dealeraddendums.com/api/linkedin/oauth/callback
 *
 * Ends by bouncing back to /admin with a short status in the query string.
 * Tokens are written server-side (encrypted) and never reach the browser.
 *
 * NOT gated on the admin cookie, deliberately — same reasoning as the Google
 * callback (see its header comment): da_admin_auth is SameSite=Strict, which a
 * cross-site top-level redirect from LinkedIn does not carry. The state cookie
 * IS the gate: set only by the admin-gated start route, httpOnly, Lax, 16
 * random bytes, 10-minute expiry.
 */
export async function GET(req: NextRequest) {
  // Return URL from the CONFIGURED site URL, never req.url — behind nginx the
  // app sees 127.0.0.1:3020 and would strand the browser on localhost.
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      `${linkedinEnv.siteUrl.replace(/\/$/, '')}/admin?${new URLSearchParams(params)}`,
    )

  if (!linkedinConfigured) return back({ linkedin: 'error', reason: 'not-configured' })

  const url = new URL(req.url)
  console.log(`[linkedin-oauth] callback on host ${req.headers.get('host') || '(unknown)'}`)
  const error = url.searchParams.get('error')
  if (error) return back({ linkedin: 'error', reason: error })

  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = cookies().get('da_linkedin_oauth_state')?.value
  cookies().delete('da_linkedin_oauth_state')

  if (!code) {
    console.warn('[linkedin-oauth] callback with no code — rejected')
    return back({ linkedin: 'error', reason: 'no-code' })
  }
  if (!state || !expected || state !== expected) {
    console.warn(
      `[linkedin-oauth] callback state mismatch — rejected (state=${state ? 'present' : 'absent'}, cookie=${expected ? 'present' : 'absent'})`,
    )
    return back({ linkedin: 'error', reason: 'state-mismatch' })
  }

  try {
    const { name } = await exchangeCodeAndStore(code)
    console.log(`[linkedin-oauth] connected${name ? ` as ${name}` : ''}`)
    return back({ linkedin: 'connected', ...(name ? { account: name } : {}) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'exchange-failed'
    console.error('[linkedin-oauth] code exchange failed:', message)
    return back({ linkedin: 'error', reason: message })
  }
}
