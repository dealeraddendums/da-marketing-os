import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hubspotChatEnv } from '@/lib/hubspot-chat/config'
import { checkSignatureV3, downloadAgentAttachment, getActorFirstName } from '@/lib/hubspot-chat/client'
import { getConversationById, insertMessage, setHubspotThreadId } from '@/lib/chat-store'
import { storeChatFile, type ChatAttachment } from '@/lib/chat-files'

export const dynamic = 'force-dynamic'
// Next 14 still caches supabase-js GETs in the Data Cache under force-dynamic: a
// poll that once read "no new messages" kept getting that answer forever, so
// agent replies never reached the widget. Every chat read must be live.
export const fetchCache = 'force-no-store'

/**
 * POST /api/chat/hubspot-events?token=… — the Custom Channel's webhookUrl.
 *
 * HubSpot posts OUTGOING_CHANNEL_MESSAGE_CREATED when an agent replies in the
 * inbox. The reply is stored as role='agent' and the visitor's widget shows it
 * on its next 3-second poll.
 *
 * Auth: the `token` query parameter (HUBSPOT_CHAT_WEBHOOK_TOKEN) is required.
 * HubSpot's docs don't say whether these webhooks carry X-HubSpot-Signature-v3;
 * when one IS present it must verify, and the outcome is recorded either way.
 *
 * Every delivery is kept verbatim in chat_hubspot_events (30 days) — the
 * evidence for the undocumented parts and a replay source for a failed relay.
 * Always 200s a request it accepted, so HubSpot doesn't retry into duplicates
 * (retries that do arrive are deduped on the message id).
 */
function tokenOk(given: string | null): boolean {
  const want = hubspotChatEnv.webhookToken
  if (!want || !given) return false
  const a = Buffer.from(want)
  const b = Buffer.from(given)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

interface HsMessage {
  id?: string
  channelAccountId?: string | number
  conversationsThreadId?: string | number
  senders?: { name?: string; actorId?: string }[]
  createdBy?: string
  text?: string
  richText?: string
  direction?: string
  attachments?: Record<string, unknown>[]
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  if (!tokenOk(url.searchParams.get('token'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const raw = await req.text()
  // HubSpot signs the URL it called (the public one), not nginx's upstream.
  const publicUri = `${hubspotChatEnv.siteUrl.replace(/\/$/, '')}${url.pathname}${url.search}`
  const signatureState = checkSignatureV3({
    method: 'POST',
    uri: publicUri,
    rawBody: raw,
    signature: req.headers.get('x-hubspot-signature-v3'),
    timestamp: req.headers.get('x-hubspot-request-timestamp'),
  })

  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    if (/^x-hubspot|^content-type$|^user-agent$/i.test(k)) headers[k] = v
  })

  let payload: unknown = null
  try { payload = JSON.parse(raw) } catch { /* recorded as null below */ }
  // HubSpot may batch events in an array.
  const events = (Array.isArray(payload) ? payload : [payload]) as Record<string, unknown>[]

  const { data: logRow } = await supabase.from('chat_hubspot_events').insert({
    event_type: events.map(e => e?.type).filter(Boolean).join(',') || null,
    signature_state: signatureState,
    headers,
    body: payload,
  }).select('id').single()

  if (signatureState === 'invalid') {
    console.warn('[hubspot-events] signature present but invalid — rejected')
    await supabase.from('chat_hubspot_events').update({ error: 'invalid signature' }).eq('id', logRow?.id)
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }

  let relayed = false
  const errors: string[] = []
  for (const ev of events) {
    if (ev?.type !== 'OUTGOING_CHANNEL_MESSAGE_CREATED') continue
    const msg = (ev.message || {}) as HsMessage
    const threadIds = (ev.channelIntegrationThreadIds || []) as string[]
    const conversationId = threadIds[0]
    if (!conversationId || !msg.id) { errors.push('missing thread or message id'); continue }

    // In-app Steven threads are relayed by da-platform (Phase 2b, after 2a).
    if (hubspotChatEnv.accountInApp && String(msg.channelAccountId) === hubspotChatEnv.accountInApp) {
      errors.push('in-app thread — da-platform relay not built yet')
      continue
    }

    try {
      const convo = await getConversationById(conversationId)
      if (!convo) { errors.push(`unknown conversation ${conversationId}`); continue }
      if (msg.conversationsThreadId != null) await setHubspotThreadId(convo.id, String(msg.conversationsThreadId))

      const attachments: ChatAttachment[] = []
      for (const att of msg.attachments || []) {
        if (att?.type && att.type !== 'FILE') continue
        const dl = await downloadAgentAttachment(att)
        if (!dl.ok || !dl.bytes) { errors.push(`attachment: ${dl.error}`); continue }
        attachments.push(await storeChatFile({
          conversationId: convo.id, name: dl.name || 'attachment',
          mime: dl.mime || 'application/octet-stream', bytes: dl.bytes,
        }))
      }

      const text = (msg.text || '').trim()
      if (!text && !attachments.length) continue
      await insertMessage(convo.id, 'agent', text, {
        attachments,
        senderName: msg.senders?.[0]?.name
          || await getActorFirstName(msg.senders?.[0]?.actorId || msg.createdBy),
        externalId: msg.id,
      })
      relayed = true
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  await supabase.from('chat_hubspot_events')
    .update({ relayed, error: errors.length ? errors.join('; ').slice(0, 1000) : null })
    .eq('id', logRow?.id)
  if (errors.length) console.error('[hubspot-events]', errors.join('; '))

  // Opportunistic 30-day trim (this app has no purge cron).
  if (Math.random() < 0.05) {
    void supabase.from('chat_hubspot_events').delete()
      .lt('received_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true })
}
