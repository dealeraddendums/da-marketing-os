// Google OAuth 2.0 — one-time connect, then server-side token refresh.
//
// Single-tenant: one row in google_connection holds Allan's refresh token.
// Access tokens are never persisted — they are short-lived, so caching them in
// memory for their lifetime is both sufficient and safer than a database copy.
//
// NOTHING here is exposed to the browser. The access token never leaves the
// server; the client only ever sees the connection STATUS.

import { supabase } from '@/lib/supabase'
import { seal, open } from './crypto'
import { googleEnv, OAUTH_SCOPES, oauthRedirectUri, oauthConfigured } from './config'

const TOKEN_URL  = 'https://oauth2.googleapis.com/token'
const AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO   = 'https://www.googleapis.com/oauth2/v2/userinfo'

export interface ConnectionStatus {
  connected: boolean
  /** A stored grant exists but Google rejected it — reconnect, don't reconfigure. */
  needsReconnect?: boolean
  configured: boolean
  accountEmail?: string | null
  scopes?: string[]
  connectedAt?: string | null
  lastRefreshAt?: string | null
  status?: string
  lastError?: string | null
}

/**
 * Build the consent URL.
 *
 * `access_type=offline` + `prompt=consent` together are what actually yield a
 * refresh token: Google returns one only on the first consent for a given
 * client/user pair unless consent is forced. Without `prompt=consent`, a
 * reconnect after a revoke comes back with an access token and no refresh
 * token, and the integration silently stops working an hour later.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: googleEnv.clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    cache: 'no-store',
  })
  const json = (await res.json()) as TokenResponse
  if (!res.ok || json.error) {
    throw new Error(json.error_description || json.error || `token endpoint ${res.status}`)
  }
  return json
}

/** Exchange the authorization code and persist the refresh token, encrypted. */
export async function exchangeCodeAndStore(code: string): Promise<{ email: string | null }> {
  const token = await postToken({
    code,
    client_id: googleEnv.clientId,
    client_secret: googleEnv.clientSecret,
    redirect_uri: oauthRedirectUri(),
    grant_type: 'authorization_code',
  })

  if (!token.refresh_token) {
    // Almost always means a prior grant already exists and Google withheld a new
    // refresh token. Say so precisely — the fix is to revoke at
    // myaccount.google.com and reconnect, not to retry.
    throw new Error(
      'Google returned no refresh token. Remove this app at ' +
      'myaccount.google.com/permissions and click Connect Google again.',
    )
  }

  let email: string | null = null
  try {
    const who = await fetch(USERINFO, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: 'no-store',
    })
    if (who.ok) email = ((await who.json()) as { email?: string }).email ?? null
  } catch {
    // Identity is a nicety for the status panel; never fail the connect over it.
  }

  const sealed = seal(token.refresh_token)
  const row = {
    singleton: true,
    account_email: email,
    scopes: token.scope ? token.scope.split(' ') : OAUTH_SCOPES,
    refresh_token_ciphertext: sealed.ciphertext,
    refresh_token_iv: sealed.iv,
    refresh_token_tag: sealed.tag,
    status: 'connected',
    last_error: null,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('google_connection')
    .upsert(row, { onConflict: 'singleton' })
  if (error) throw new Error(`storing connection: ${error.message}`)

  cachedAccess = null // a new grant invalidates any in-memory access token
  return { email }
}

// In-memory access token, refreshed on demand. Deliberately not persisted:
// it expires in ~1 hour, and a copy in the database is one more place a live
// credential can leak from. A process restart just refreshes again.
let cachedAccess: { token: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (cachedAccess && Date.now() < cachedAccess.expiresAt) return cachedAccess.token

  const { data, error } = await supabase
    .from('google_connection')
    .select('refresh_token_ciphertext, refresh_token_iv, refresh_token_tag')
    .eq('singleton', true)
    .maybeSingle()
  if (error) throw new Error(`reading connection: ${error.message}`)
  if (!data) throw new Error('Google is not connected yet.')

  const refreshToken = open({
    ciphertext: data.refresh_token_ciphertext,
    iv: data.refresh_token_iv,
    tag: data.refresh_token_tag,
  })

  try {
    const token = await postToken({
      refresh_token: refreshToken,
      client_id: googleEnv.clientId,
      client_secret: googleEnv.clientSecret,
      grant_type: 'refresh_token',
    })
    // Expire 60s early so a call that starts just before the boundary does not
    // land at Google with a token that died in flight.
    cachedAccess = {
      token: token.access_token!,
      expiresAt: Date.now() + ((token.expires_in ?? 3600) - 60) * 1000,
    }
    await supabase.from('google_connection')
      .update({ last_refresh_at: new Date().toISOString(), status: 'connected', last_error: null })
      .eq('singleton', true)
    return cachedAccess.token
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Distinguish "the grant is gone" from "Google had a bad minute".
    //
    // invalid_grant means the refresh token is dead and no amount of retrying
    // will help — the only fix is to authorize again. That is not an exotic
    // case here: while the OAuth consent screen is in **Testing** publishing
    // status, Google expires refresh tokens after 7 days, so this will happen
    // roughly weekly until the app is published to Production. Marking it
    // 'revoked' (not 'error') is what lets the UI show a Reconnect button
    // instead of an opaque failure the operator cannot act on.
    const revoked = /invalid_grant|token has been expired or revoked/i.test(message)
    await supabase.from('google_connection')
      .update({
        status: revoked ? 'revoked' : 'error',
        last_error: revoked
          ? 'Google refresh token is no longer valid — reconnect required. ' +
            '(Expected about weekly while the OAuth app is in Testing status: ' +
            'Google expires refresh tokens after 7 days. Publishing the app to ' +
            'Production stops this.)'
          : message,
      })
      .eq('singleton', true)
    cachedAccess = null
    throw new Error(
      revoked
        ? 'Google connection expired — click Reconnect Google.'
        : `Google token refresh failed: ${message}`,
    )
  }
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  if (!oauthConfigured) return { connected: false, configured: false }
  const { data, error } = await supabase
    .from('google_connection')
    .select('account_email, scopes, connected_at, last_refresh_at, status, last_error')
    .eq('singleton', true)
    .maybeSingle()
  if (error || !data) return { connected: false, configured: true }
  return {
    connected: data.status === 'connected',
    // A row exists but the grant is dead: the UI shows "Reconnect Google"
    // rather than the first-time "Connect Google" copy, so it is obvious this
    // is a renewal and not a fresh setup.
    needsReconnect: data.status === 'revoked',
    configured: true,
    accountEmail: data.account_email,
    scopes: data.scopes ?? [],
    connectedAt: data.connected_at,
    lastRefreshAt: data.last_refresh_at,
    status: data.status,
    lastError: data.last_error,
  }
}

/** Revoke at Google, then drop the row. Best-effort on the Google call: if the
 *  grant is already gone, deleting our copy is still the right outcome. */
export async function disconnect(): Promise<void> {
  try {
    const { data } = await supabase
      .from('google_connection')
      .select('refresh_token_ciphertext, refresh_token_iv, refresh_token_tag')
      .eq('singleton', true)
      .maybeSingle()
    if (data) {
      const refreshToken = open({
        ciphertext: data.refresh_token_ciphertext,
        iv: data.refresh_token_iv,
        tag: data.refresh_token_tag,
      })
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      })
    }
  } catch {
    // Already revoked / undecryptable — fall through and clear our side.
  }
  cachedAccess = null
  await supabase.from('google_connection').delete().eq('singleton', true)
}
