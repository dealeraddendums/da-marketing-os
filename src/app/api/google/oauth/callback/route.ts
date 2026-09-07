import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeAndStore } from '@/lib/google/oauth'
import { oauthConfigured, googleEnv } from '@/lib/google/config'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/oauth/callback — the redirect URI registered in Google Cloud:
 *   https://www.dealeraddendums.com/api/google/oauth/callback
 *
 * Ends by bouncing back to /admin with a short status in the query string. The
 * refresh token itself is written server-side and never reaches the browser.
 */
/*
 * ── Why this route is NOT gated on the admin cookie ────────────────────────
 * It used to be, and that silently broke the whole flow: `da_admin_auth` is set
 * with SameSite=Strict, and a browser does not send a Strict cookie on a
 * cross-site top-level navigation — which is exactly what Google's redirect
 * back to here is. So the callback saw no cookie, answered 401, and discarded a
 * valid authorization code (observed 2026-09-06).
 *
 * The `state` cookie is the correct gate, and is the standard OAuth one:
 *   - it is set ONLY by /api/google/oauth/start, which IS admin-gated;
 *   - it is httpOnly, so no page script can read or forge it;
 *   - it is SameSite=Lax, so it DOES survive this navigation;
 *   - it is 16 random bytes and expires in 10 minutes.
 * Possessing a state cookie that matches the state Google echoes back therefore
 * proves this flow was started by an authenticated admin in this browser. An
 * unauthenticated request carries no state cookie and is rejected below — as
 * the two internet scanners that already hit this path were.
 */
export async function GET(req: NextRequest) {
  // Build the return URL from the CONFIGURED public site URL, never from
  // req.url. Behind nginx the app is reached on 127.0.0.1:3020, so
  // `new URL('/admin', req.url)` resolves to http://localhost:3020/admin — which
  // is what the browser was actually sent after a successful connect
  // (ERR_CONNECTION_REFUSED). The token had already been stored by then; only
  // the final hop was wrong. Applies to the error redirects too, or a failed
  // connect would strand the browser the same way.
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      `${googleEnv.siteUrl.replace(/\/$/, '')}/admin?${new URLSearchParams(params)}`,
    )

  if (!oauthConfigured) return back({ google: 'error', reason: 'not-configured' })

  const url = new URL(req.url)
  // Host is logged on every callback: if Google ever redirects somewhere other
  // than the host that minted the state cookie, the resulting "state mismatch"
  // is otherwise indistinguishable from a genuine CSRF rejection.
  console.log(`[google-oauth] callback on host ${req.headers.get('host') || '(unknown)'}`)
  const error = url.searchParams.get('error')
  if (error) return back({ google: 'error', reason: error })

  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = cookies().get('da_google_oauth_state')?.value
  cookies().delete('da_google_oauth_state')

  // Log the rejection paths. The 401 this route used to return was silent, so
  // the only evidence of a failed connect was an empty table — make any future
  // failure visible in `pm2 logs da-marketing`.
  if (!code) {
    console.warn('[google-oauth] callback with no code — rejected')
    return back({ google: 'error', reason: 'no-code' })
  }
  if (!state || !expected || state !== expected) {
    console.warn(
      `[google-oauth] callback state mismatch — rejected (state=${state ? 'present' : 'absent'}, cookie=${expected ? 'present' : 'absent'})`,
    )
    return back({ google: 'error', reason: 'state-mismatch' })
  }

  try {
    const { email } = await exchangeCodeAndStore(code)
    console.log(`[google-oauth] connected${email ? ` as ${email}` : ''}`)
    return back({ google: 'connected', ...(email ? { account: email } : {}) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'exchange-failed'
    console.error('[google-oauth] code exchange failed:', message)
    return back({ google: 'error', reason: message })
  }
}
