// LinkedIn OAuth 2.0 — member-profile grant, singleton row, tokens encrypted.
//
// Differences from the Google integration this mirrors (lib/google/oauth.ts):
//  - LinkedIn ACCESS tokens are long-lived (~60 days), so the access token is
//    persisted encrypted; there is no refresh-on-every-call.
//  - LinkedIn only issues REFRESH tokens to apps with programmatic refresh
//    enabled. When one arrives it is stored and used near expiry; when it
//    doesn't, the connection simply ages out at expires_at and the admin badge
//    warns 14 days ahead so Allan reconnects in time.
//
// NOTHING here is exposed to the browser. Tokens never leave the server; the
// client only ever sees the connection STATUS.

import { createClient } from '@supabase/supabase-js'
import { seal, open, type Sealed } from './crypto'
import {
  linkedinEnv, LINKEDIN_SCOPES, linkedinRedirectUri, linkedinConfigured,
} from './config'

const AUTH_URL  = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const USERINFO  = 'https://api.linkedin.com/v2/userinfo'

// Own supabase client, NOT the shared one from lib/supabase: every call forces
// cache:'no-store'. Found live 2026-11-16: Next's persisted data cache
// (.next/cache/fetch-cache) had stored a BUILD-TIME read of
// linkedin_connections — made when the table existed but no one had connected
// yet — and kept serving that empty result at runtime, so the status endpoint
// said "not connected" while Allan's grant sat in the database. Credential
// reads must never be served from a cache in any case.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (url, init) => fetch(url, { ...(init || {}), cache: 'no-store' }) } },
)

/** How close to expiry a stored access token still counts as usable. */
const EXPIRY_SLACK_MS = 5 * 60 * 1000

export interface LinkedinStatus {
  configured: boolean
  connected: boolean
  /** Grant dead or aged out — the button should read Reconnect. */
  needsReconnect?: boolean
  name?: string | null
  memberUrn?: string | null
  expiresAt?: string | null
  daysLeft?: number | null
  /** Within 14 days of token expiry — the badge turns amber. */
  expiresSoon?: boolean
  hasRefreshToken?: boolean
  status?: string
  lastError?: string | null
  postingEnabled: boolean
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: linkedinEnv.clientId,
    redirect_uri: linkedinRedirectUri(),
    scope: LINKEDIN_SCOPES.join(' '),
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token?: string
  expires_in?: number                  // seconds (~5,184,000 = 60 days)
  refresh_token?: string               // only for apps with refresh enabled
  refresh_token_expires_in?: number    // seconds (~365 days when present)
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
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(json.error_description || json.error || `token endpoint ${res.status}`)
  }
  return json
}

interface ConnectionRow {
  member_urn: string | null
  display_name: string | null
  scopes: string[] | null
  access_token_ciphertext: string
  access_token_iv: string
  access_token_tag: string
  expires_at: string
  refresh_token_ciphertext: string | null
  refresh_token_iv: string | null
  refresh_token_tag: string | null
  refresh_token_expires_at: string | null
  status: string
  last_error: string | null
  connected_at: string | null
}

async function readRow(): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from('linkedin_connections')
    .select('*')
    .eq('singleton', true)
    .maybeSingle()
  if (error) throw new Error(`reading linkedin connection: ${error.message}`)
  return (data as ConnectionRow) || null
}

/** Persist a token response (connect or refresh), preserving identity fields
 *  when the response doesn't carry them. */
async function storeTokens(
  token: TokenResponse,
  identity?: { memberUrn: string | null; name: string | null },
): Promise<void> {
  const now = Date.now()
  const sealedAccess = seal(token.access_token!)
  const sealedRefresh: Sealed | null = token.refresh_token ? seal(token.refresh_token) : null

  const row: Record<string, unknown> = {
    singleton: true,
    scopes: token.scope ? token.scope.split(/[ ,]+/).filter(Boolean) : LINKEDIN_SCOPES,
    access_token_ciphertext: sealedAccess.ciphertext,
    access_token_iv: sealedAccess.iv,
    access_token_tag: sealedAccess.tag,
    expires_at: new Date(now + (token.expires_in ?? 5184000) * 1000).toISOString(),
    status: 'connected',
    last_error: null,
    updated_at: new Date().toISOString(),
  }
  if (sealedRefresh) {
    row.refresh_token_ciphertext = sealedRefresh.ciphertext
    row.refresh_token_iv = sealedRefresh.iv
    row.refresh_token_tag = sealedRefresh.tag
    row.refresh_token_expires_at = token.refresh_token_expires_in
      ? new Date(now + token.refresh_token_expires_in * 1000).toISOString()
      : null
  }
  if (identity) {
    row.member_urn = identity.memberUrn
    row.display_name = identity.name
    row.connected_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('linkedin_connections')
    .upsert(row, { onConflict: 'singleton' })
  if (error) throw new Error(`storing linkedin connection: ${error.message}`)
}

/** Exchange the authorization code, resolve the member identity, store it all. */
export async function exchangeCodeAndStore(code: string): Promise<{ name: string | null }> {
  const token = await postToken({
    grant_type: 'authorization_code',
    code,
    client_id: linkedinEnv.clientId,
    client_secret: linkedinEnv.clientSecret,
    redirect_uri: linkedinRedirectUri(),
  })

  // Identity: /v2/userinfo (OpenID Connect). `sub` is the member id the post
  // author URN is built from — without it we cannot post, so unlike the Google
  // flow this lookup is REQUIRED.
  const who = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
  })
  if (!who.ok) {
    throw new Error(`userinfo failed (${who.status}) — was the openid scope granted?`)
  }
  const info = (await who.json()) as { sub?: string; name?: string; given_name?: string; family_name?: string }
  if (!info.sub) throw new Error('userinfo returned no member id (sub)')
  const name = info.name
    || [info.given_name, info.family_name].filter(Boolean).join(' ')
    || null

  await storeTokens(token, { memberUrn: `urn:li:person:${info.sub}`, name })
  if (!token.refresh_token) {
    console.warn(
      '[linkedin-oauth] no refresh token issued (programmatic refresh not ' +
      'enabled for this app) — the connection ages out in ~60 days; the admin ' +
      'badge warns 14 days ahead.',
    )
  }
  return { name }
}

/**
 * A valid access token + the author URN, for the poster. Refreshes (and
 * re-stores) when the stored token is at/near expiry and a live refresh token
 * exists; otherwise a stale grant throws a reconnect error after marking the
 * row 'expired' so the badge flips.
 */
export async function getAccessToken(): Promise<{ accessToken: string; memberUrn: string }> {
  const row = await readRow()
  if (!row) throw new Error('LinkedIn is not connected yet — click Connect LinkedIn in the Social Queue.')
  if (!row.member_urn) throw new Error('LinkedIn connection has no member id — reconnect.')

  const expiresAt = new Date(row.expires_at).getTime()
  if (Date.now() < expiresAt - EXPIRY_SLACK_MS && row.status === 'connected') {
    return {
      accessToken: open({
        ciphertext: row.access_token_ciphertext,
        iv: row.access_token_iv,
        tag: row.access_token_tag,
      }),
      memberUrn: row.member_urn,
    }
  }

  // At/near expiry (or previously flagged): try the refresh token if we have a live one.
  const refreshAlive = row.refresh_token_ciphertext
    && (!row.refresh_token_expires_at || Date.now() < new Date(row.refresh_token_expires_at).getTime())
  if (refreshAlive) {
    try {
      const token = await postToken({
        grant_type: 'refresh_token',
        refresh_token: open({
          ciphertext: row.refresh_token_ciphertext!,
          iv: row.refresh_token_iv!,
          tag: row.refresh_token_tag!,
        }),
        client_id: linkedinEnv.clientId,
        client_secret: linkedinEnv.clientSecret,
      })
      await storeTokens(token)
      await supabase.from('linkedin_connections')
        .update({ last_refresh_at: new Date().toISOString() })
        .eq('singleton', true)
      console.log('[linkedin-oauth] access token refreshed')
      return { accessToken: token.access_token!, memberUrn: row.member_urn }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await supabase.from('linkedin_connections')
        .update({ status: 'error', last_error: `refresh failed: ${message}` })
        .eq('singleton', true)
      throw new Error(`LinkedIn token refresh failed: ${message} — click Reconnect LinkedIn.`)
    }
  }

  await supabase.from('linkedin_connections')
    .update({
      status: 'expired',
      last_error: 'Access token expired and no usable refresh token — reconnect required.',
    })
    .eq('singleton', true)
  throw new Error('LinkedIn connection expired — click Reconnect LinkedIn.')
}

/** Mark the stored grant dead after LinkedIn rejects it (401 on a post). */
export async function markRevoked(detail: string): Promise<void> {
  await supabase.from('linkedin_connections')
    .update({ status: 'revoked', last_error: detail })
    .eq('singleton', true)
}

export async function getLinkedinStatus(): Promise<LinkedinStatus> {
  const base = { configured: linkedinConfigured, postingEnabled: linkedinEnv.postingEnabled }
  if (!linkedinConfigured) return { ...base, connected: false }
  let row: ConnectionRow | null = null
  try {
    row = await readRow()
  } catch (e) {
    // Status must never 500 the admin page, but a swallowed read error looks
    // exactly like "not connected" — log it so the two are distinguishable.
    console.warn('[linkedin-status] read failed:', e instanceof Error ? e.message : e)
    return { ...base, connected: false }
  }
  if (!row) {
    console.warn('[linkedin-status] no connection row found')
    return { ...base, connected: false }
  }

  const expiresAt = new Date(row.expires_at).getTime()
  const daysLeft = Math.floor((expiresAt - Date.now()) / 86400000)
  const aliveByDate = Date.now() < expiresAt
  const connected = row.status === 'connected' && aliveByDate
  return {
    ...base,
    connected,
    needsReconnect: !connected, // a row exists but can't post — Reconnect, not Connect
    name: row.display_name,
    memberUrn: row.member_urn,
    expiresAt: row.expires_at,
    daysLeft,
    expiresSoon: connected && daysLeft <= 14,
    hasRefreshToken: !!row.refresh_token_ciphertext,
    status: aliveByDate ? row.status : (row.status === 'connected' ? 'expired' : row.status),
    lastError: row.last_error,
  }
}
