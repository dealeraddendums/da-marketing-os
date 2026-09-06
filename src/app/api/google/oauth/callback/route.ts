import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { isAdminAuthed } from '@/lib/reputation'
import { exchangeCodeAndStore } from '@/lib/google/oauth'
import { oauthConfigured } from '@/lib/google/config'

export const dynamic = 'force-dynamic'

/**
 * GET /api/google/oauth/callback — the redirect URI registered in Google Cloud:
 *   https://www.dealeraddendums.com/api/google/oauth/callback
 *
 * Ends by bouncing back to /admin with a short status in the query string. The
 * refresh token itself is written server-side and never reaches the browser.
 */
export async function GET(req: NextRequest) {
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(new URL(`/admin?${new URLSearchParams(params)}`, req.url))

  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!oauthConfigured)  return back({ google: 'error', reason: 'not-configured' })

  const url = new URL(req.url)
  const error = url.searchParams.get('error')
  if (error) return back({ google: 'error', reason: error })

  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = cookies().get('da_google_oauth_state')?.value
  cookies().delete('da_google_oauth_state')

  if (!code) return back({ google: 'error', reason: 'no-code' })
  if (!state || !expected || state !== expected) {
    return back({ google: 'error', reason: 'state-mismatch' })
  }

  try {
    const { email } = await exchangeCodeAndStore(code)
    return back({ google: 'connected', ...(email ? { account: email } : {}) })
  } catch (err) {
    return back({ google: 'error', reason: err instanceof Error ? err.message : 'exchange-failed' })
  }
}
