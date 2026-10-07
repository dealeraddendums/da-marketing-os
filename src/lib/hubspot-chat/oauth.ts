// HubSpot OAuth for the chat bridge — one-time install, then server-side refresh.
//
// Single-tenant: one row in hubspot_chat_connection holds the refresh token
// for portal 23896347, encrypted at rest (lib/google/crypto — same key, same
// AES-256-GCM). Access tokens live 30 minutes and are cached in memory only.

import { supabase } from '@/lib/supabase'
import { seal, open } from '@/lib/google/crypto'
import { hubspotChatEnv, HUBSPOT_CHAT_SCOPES, oauthRedirectUri } from './config'

// The 2026-09 token endpoint wants every parameter in the body. v1 is the
// documented legacy path (unsupported after Sept 2027) and is tried only if the
// dated path is missing, so a docs/host mismatch cannot strand the grant.
const TOKEN_URLS = [
  'https://api.hubspot.com/oauth/2026-09/token',
  'https://api.hubapi.com/oauth/v1/token',
]

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  hub_id?: number
  scopes?: string[]
  scope?: string
  error?: string
  message?: string
  error_description?: string
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  let last = ''
  for (const url of TOKEN_URLS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      cache: 'no-store',
    })
    if (res.status === 404) { last = `404 at ${url}`; continue }
    const json = (await res.json().catch(() => ({}))) as TokenResponse
    if (!res.ok || json.error) {
      throw new Error(json.message || json.error_description || json.error || `token endpoint ${res.status}`)
    }
    return json
  }
  throw new Error(`no token endpoint answered (${last})`)
}

/** Consent URL pinned to our portal, so the install can only land on 23896347. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: hubspotChatEnv.clientId,
    redirect_uri: oauthRedirectUri(),
    scope: HUBSPOT_CHAT_SCOPES.join(' '),
    state,
  })
  return `https://app.hubspot.com/oauth/${hubspotChatEnv.portalId}/authorize?${params.toString()}`
}

async function storeRefreshToken(refreshToken: string, extra: Record<string, unknown>) {
  const sealed = seal(refreshToken)
  const { error } = await supabase.from('hubspot_chat_connection').upsert({
    singleton: true,
    refresh_token_ciphertext: sealed.ciphertext,
    refresh_token_iv: sealed.iv,
    refresh_token_tag: sealed.tag,
    status: 'connected',
    last_error: null,
    updated_at: new Date().toISOString(),
    ...extra,
  }, { onConflict: 'singleton' })
  if (error) throw new Error(`storing HubSpot connection: ${error.message}`)
}

export async function exchangeCodeAndStore(code: string): Promise<{ portalId: string | null }> {
  const token = await postToken({
    grant_type: 'authorization_code',
    client_id: hubspotChatEnv.clientId,
    client_secret: hubspotChatEnv.clientSecret,
    redirect_uri: oauthRedirectUri(),
    code,
  })
  if (!token.refresh_token) throw new Error('HubSpot returned no refresh token')
  const portalId = token.hub_id != null ? String(token.hub_id) : null
  // A grant for any other portal is refused outright — every message this
  // bridge publishes would otherwise go to someone else's inbox.
  if (portalId && portalId !== hubspotChatEnv.portalId) {
    throw new Error(`installed on portal ${portalId}, expected ${hubspotChatEnv.portalId}`)
  }
  await storeRefreshToken(token.refresh_token, {
    portal_id: portalId,
    scopes: token.scopes ?? (token.scope ? token.scope.split(' ') : HUBSPOT_CHAT_SCOPES),
    connected_at: new Date().toISOString(),
  })
  cached = token.access_token
    ? { token: token.access_token, expiresAt: Date.now() + ((token.expires_in ?? 1800) - 60) * 1000 }
    : null
  return { portalId }
}

let cached: { token: string; expiresAt: number } | null = null
let inflight: Promise<string> | null = null

/** A valid access token. Single-flight, so a burst of chat messages at expiry
 *  causes one refresh, not one per message. */
export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('hubspot_chat_connection')
      .select('refresh_token_ciphertext, refresh_token_iv, refresh_token_tag')
      .eq('singleton', true)
      .maybeSingle()
    if (error) throw new Error(`reading HubSpot connection: ${error.message}`)
    if (!data) throw new Error('HubSpot chat bridge is not connected yet.')
    const refreshToken = open({
      ciphertext: data.refresh_token_ciphertext,
      iv: data.refresh_token_iv,
      tag: data.refresh_token_tag,
    })
    try {
      const token = await postToken({
        grant_type: 'refresh_token',
        client_id: hubspotChatEnv.clientId,
        client_secret: hubspotChatEnv.clientSecret,
        refresh_token: refreshToken,
      })
      cached = { token: token.access_token!, expiresAt: Date.now() + ((token.expires_in ?? 1800) - 60) * 1000 }
      // HubSpot's docs do not say whether refresh tokens rotate. If a new one
      // comes back, it replaces the stored one — keeping the old one would
      // leave a dead credential on file the moment rotation starts.
      if (token.refresh_token && token.refresh_token !== refreshToken) {
        await storeRefreshToken(token.refresh_token, { last_refresh_at: new Date().toISOString() })
      } else {
        await supabase.from('hubspot_chat_connection')
          .update({ last_refresh_at: new Date().toISOString(), status: 'connected', last_error: null })
          .eq('singleton', true)
      }
      return cached.token
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const revoked = /invalid, expired or revoked|invalid_grant|BAD_REFRESH_TOKEN/i.test(message)
      await supabase.from('hubspot_chat_connection')
        .update({ status: revoked ? 'revoked' : 'error', last_error: message })
        .eq('singleton', true)
      cached = null
      throw new Error(revoked ? 'HubSpot chat grant revoked — reinstall the app.' : `HubSpot token refresh failed: ${message}`)
    }
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}
