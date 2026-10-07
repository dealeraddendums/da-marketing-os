// HubSpot Custom Channels client for the chat bridge.
//
// Direction vocabulary (HubSpot's, from the INBOX's point of view):
//   INCOMING = visitor → inbox (we publish these)
//   OUTGOING = agent → visitor (HubSpot webhooks these to us)

import crypto from 'crypto'
import { getAccessToken } from './oauth'
import { hubspotChatEnv, HUBSPOT_API, CHANNELS_BASE } from './config'

/** The opaque delivery identifier each channel account was created with —
 *  the inbox side of every INCOMING message names one of these. */
export const ACCOUNT_IDENTIFIERS = {
  homepage: 'steven-homepage',
  inapp: 'steven-inapp',
} as const
export type Surface = keyof typeof ACCOUNT_IDENTIFIERS

export interface HsAttachment {
  type: 'FILE'
  fileId: string
  fileUsageType: 'IMAGE' | 'OTHER' | 'AUDIO' | 'VOICE_RECORDING' | 'STICKER'
}

export async function hsFetch(path: string, init: RequestInit & { json?: unknown } = {}) {
  const token = await getAccessToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  let body = init.body
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.json)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(`${HUBSPOT_API}${path}`, {
      ...init, body, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      signal: controller.signal, cache: 'no-store',
    })
    const text = await res.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { ok: res.ok, status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

function errorText(r: { status: number; data: unknown }): string {
  const d = r.data as { message?: string } | string | null
  return `HTTP ${r.status}: ${typeof d === 'string' ? d.slice(0, 300) : d?.message || JSON.stringify(d).slice(0, 300)}`
}

/**
 * Publish one visitor message into the conversation's inbox thread.
 *
 * `threadId` is OUR conversation id: the channel uses the INTEGRATION_THREAD_ID
 * threading model, so every message carrying the same id lands in the same
 * inbox thread, and the webhook hands the same id back on agent replies.
 *
 * The visitor is identified by email when we have one — HubSpot resolves the
 * contact association from HS_EMAIL_ADDRESS automatically, which is what files
 * the thread under the dealer's record. Without an email the visitor is an
 * opaque id and the thread is unassociated until an agent links it.
 */
export async function publishVisitorMessage(opts: {
  surface: Surface
  threadId: string
  idempotencyId: string
  text: string
  richText?: string
  visitorName?: string | null
  visitorEmail?: string | null
  visitorKey: string
  attachments?: HsAttachment[]
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const channelAccountId = opts.surface === 'homepage'
    ? hubspotChatEnv.accountHomepage
    : hubspotChatEnv.accountInApp
  if (!hubspotChatEnv.channelId || !channelAccountId) return { ok: false, error: 'bridge_not_configured' }

  const sender = opts.visitorEmail
    ? { type: 'HS_EMAIL_ADDRESS', value: opts.visitorEmail.toLowerCase() }
    : { type: 'CHANNEL_SPECIFIC_OPAQUE_ID', value: opts.visitorKey }

  const r = await hsFetch(`${CHANNELS_BASE}/${hubspotChatEnv.channelId}/messages`, {
    method: 'POST',
    json: {
      text: opts.text || ' ',
      ...(opts.richText ? { richText: opts.richText } : {}),
      channelAccountId,
      integrationThreadId: opts.threadId,
      integrationIdempotencyId: opts.idempotencyId,
      messageDirection: 'INCOMING',
      senders: [{ deliveryIdentifier: sender, ...(opts.visitorName ? { name: opts.visitorName } : {}) }],
      recipients: [{
        deliveryIdentifier: { type: 'CHANNEL_SPECIFIC_OPAQUE_ID', value: ACCOUNT_IDENTIFIERS[opts.surface] },
        name: 'DealerAddendums',
      }],
      timestamp: new Date().toISOString(),
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
    },
  })
  if (!r.ok) return { ok: false, error: errorText(r) }
  return { ok: true, messageId: (r.data as { id?: string } | null)?.id }
}

/**
 * An agent's display name for the widget ("Allan"). The webhook carries only
 * the sender's actor id (A-<userId>), so it's resolved through the
 * Conversations actors endpoint (conversations.read) and cached for the life
 * of the process. First name only — that's how agents sign chats. Any failure
 * returns null and the widget shows "DA Team".
 */
const actorNames = new Map<string, string | null>()
export async function getActorFirstName(actorId: string | null | undefined): Promise<string | null> {
  if (!actorId) return null
  if (actorNames.has(actorId)) return actorNames.get(actorId) ?? null
  const r = await hsFetch(`/conversations/v3/conversations/actors/${encodeURIComponent(actorId)}`).catch(() => null)
  const d = (r?.ok ? r.data : null) as { name?: string; email?: string } | null
  const first = (d?.name || '').trim().split(/\s+/)[0] || null
  actorNames.set(actorId, first)
  return first
}

/** Upload a visitor's file to HubSpot Files (custom channels attach by fileId
 *  only — there is no attach-by-URL). PRIVATE: the file is for the inbox, not
 *  for the public web. */
export async function uploadToHubSpotFiles(opts: {
  bytes: Buffer
  fileName: string
  mime: string
}): Promise<{ ok: boolean; fileId?: string; error?: string }> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(opts.bytes)], { type: opts.mime }), opts.fileName)
  form.append('folderPath', '/chat-attachments')
  form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false, duplicateValidationStrategy: 'NONE' }))
  const r = await hsFetch('/files/v3/files', { method: 'POST', body: form })
  if (!r.ok) return { ok: false, error: errorText(r) }
  const id = (r.data as { id?: string | number } | null)?.id
  return id != null ? { ok: true, fileId: String(id) } : { ok: false, error: 'no file id returned' }
}

/**
 * Download an agent's attachment. The webhook's attachment shape is not
 * documented, so this accepts every form it could plausibly take: an absolute
 * URL in `fileId`/`url`, or a numeric Files id we resolve to a signed URL.
 */
export async function downloadAgentAttachment(att: Record<string, unknown>): Promise<{
  ok: boolean; bytes?: Buffer; name?: string; mime?: string; error?: string
}> {
  const raw = (att.url ?? att.fileId ?? att.id) as string | number | undefined
  if (raw == null) return { ok: false, error: 'attachment has no url or fileId' }
  let url = String(raw)
  let name = (att.name ?? att.fileName) as string | undefined
  if (!/^https?:\/\//i.test(url)) {
    const s = await hsFetch(`/files/v3/files/${encodeURIComponent(url)}/signed-url`)
    if (!s.ok) return { ok: false, error: `signed-url ${errorText(s)}` }
    const sd = s.data as { url?: string; name?: string; extension?: string }
    if (!sd?.url) return { ok: false, error: 'signed-url response had no url' }
    url = sd.url
    if (!name && sd.name) name = sd.extension ? `${sd.name}.${sd.extension}` : sd.name
  }
  // HubSpot-hosted URLs may need the bearer; public signed URLs ignore it.
  const token = await getAccessToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) return { ok: false, error: `download HTTP ${res.status}` }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (!name) name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'attachment')
  return { ok: true, bytes, name, mime: res.headers.get('content-type') || 'application/octet-stream' }
}

/**
 * HubSpot request signature v3: base64(HMAC-SHA256(clientSecret,
 * method + uri + body + timestamp)), timestamp within 5 minutes.
 * Returns 'absent' when HubSpot sent no signature — the custom-channel docs do
 * not say whether these webhooks are signed, so absence is recorded, not fatal.
 */
export function checkSignatureV3(opts: {
  method: string
  uri: string
  rawBody: string
  signature: string | null
  timestamp: string | null
}): 'valid' | 'invalid' | 'absent' {
  if (!opts.signature) return 'absent'
  const secret = hubspotChatEnv.clientSecret
  const ts = Number(opts.timestamp)
  if (!secret || !Number.isFinite(ts)) return 'invalid'
  if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) return 'invalid'
  // HubSpot decodes these characters in the URI before signing.
  const uri = opts.uri
    .replace(/%3A/gi, ':').replace(/%2F/gi, '/').replace(/%3F/gi, '?').replace(/%40/gi, '@')
    .replace(/%21/gi, '!').replace(/%24/gi, '$').replace(/%27/gi, "'").replace(/%28/gi, '(')
    .replace(/%29/gi, ')').replace(/%2A/gi, '*').replace(/%2C/gi, ',').replace(/%3B/gi, ';')
  const expected = crypto.createHmac('sha256', secret)
    .update(`${opts.method}${uri}${opts.rawBody}${opts.timestamp}`)
    .digest('base64')
  const a = Buffer.from(expected)
  const b = Buffer.from(opts.signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? 'valid' : 'invalid'
}
