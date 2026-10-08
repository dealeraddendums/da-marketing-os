import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'
import { hsFetch, ACCOUNT_IDENTIFIERS, type Surface } from '@/lib/hubspot-chat/client'
import { ALLOWED_CHAT_MIME, MAX_CHAT_FILE_BYTES } from '@/lib/chat-files'
import { refreshCompanyChatNote } from '@/lib/chat-crm-log'
import {
  hubspotChatEnv, HUBSPOT_API, CHANNELS_BASE, webhookUrl, hubspotHandoffEnabled,
} from '@/lib/hubspot-chat/config'

export const dynamic = 'force-dynamic'
// Next 14 still caches supabase-js GETs in the Data Cache under force-dynamic: a
// poll that once read "no new messages" kept getting that answer forever, so
// agent replies never reached the widget. Every chat read must be live.
export const fetchCache = 'force-no-store'

/**
 * POST /api/hubspot-chat/setup — admin-only wiring for the Custom Channel.
 * Body: { action, ... }
 *   status          connection + config readiness (no secrets)
 *   register        create the channel (developer API key + app id)
 *   channel         read the channel back
 *   update-channel  PATCH capabilities / webhookUrl (re-run after a change here)
 *   inboxes         list inboxes (OAuth) — to pick the inboxId
 *   connect         { inboxId, surface: 'homepage'|'inapp' } create a channel account
 *   accounts        list channel accounts
 *   refresh-note    { conversationId } rewrite that chat's company-timeline note
 *   recent-threads  read-only: the inbox's latest threads + their last messages (diagnostics)
 * The resulting ids go into .env.production (HUBSPOT_CHAT_CHANNEL_ID,
 * HUBSPOT_CHAT_ACCOUNT_HOMEPAGE / _INAPP) — see docs/chat-hubspot-bridge.md.
 */
function channelSpec() {
  return {
    name: 'Steven chat',
    webhookUrl: webhookUrl(),
    channelDescription: 'Live hand-off from the Steven chat on dealeraddendums.com and the DA Platform.',
    capabilities: {
      deliveryIdentifierTypes: ['HS_EMAIL_ADDRESS', 'CHANNEL_SPECIFIC_OPAQUE_ID'],
      richText: ['HYPERLINK'],
      allowInlineImages: true,
      allowOutgoingMessages: true,
      outgoingAttachmentTypes: ['FILE'],
      allowedFileAttachmentMimeTypes: Array.from(ALLOWED_CHAT_MIME),
      maxFileAttachmentCount: 5,
      maxFileAttachmentSizeBytes: MAX_CHAT_FILE_BYTES,
      maxTotalFileAttachmentSizeBytes: MAX_CHAT_FILE_BYTES * 3,
      threadingModel: 'INTEGRATION_THREAD_ID',
    },
  }
}

async function devKeyFetch(path: string, method: string, json?: unknown) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${HUBSPOT_API}${path}${sep}hapikey=${encodeURIComponent(hubspotChatEnv.developerKey)}&appId=${encodeURIComponent(hubspotChatEnv.appId)}`
  const res = await fetch(url, {
    method,
    headers: json ? { 'Content-Type': 'application/json' } : undefined,
    body: json ? JSON.stringify(json) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  let data: unknown = text
  try { data = JSON.parse(text) } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, data }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action || 'status')

  switch (action) {
    case 'status': {
      const { data } = await supabase.from('hubspot_chat_connection')
        .select('portal_id, scopes, status, last_error, last_refresh_at, connected_at').eq('singleton', true).maybeSingle()
      return NextResponse.json({
        connection: data || null,
        config: {
          provider: hubspotChatEnv.provider,
          handoffEnabled: hubspotHandoffEnabled(),
          clientId: !!hubspotChatEnv.clientId, clientSecret: !!hubspotChatEnv.clientSecret,
          appId: hubspotChatEnv.appId || null, developerKey: !!hubspotChatEnv.developerKey,
          webhookToken: !!hubspotChatEnv.webhookToken,
          channelId: hubspotChatEnv.channelId || null,
          accountHomepage: hubspotChatEnv.accountHomepage || null,
          accountInApp: hubspotChatEnv.accountInApp || null,
        },
      })
    }
    case 'register':
      return NextResponse.json(await devKeyFetch(CHANNELS_BASE, 'POST', channelSpec()))
    case 'channel':
      return NextResponse.json(await devKeyFetch(`${CHANNELS_BASE}/${hubspotChatEnv.channelId}`, 'GET'))
    case 'update-channel':
      return NextResponse.json(await devKeyFetch(`${CHANNELS_BASE}/${hubspotChatEnv.channelId}`, 'PATCH', channelSpec()))
    case 'inboxes':
      return NextResponse.json(await hsFetch('/conversations/v3/conversations/inboxes?limit=100'))
    case 'accounts':
      return NextResponse.json(await hsFetch(`${CHANNELS_BASE}/${hubspotChatEnv.channelId}/channel-accounts`))
    case 'connect': {
      const surface = String(body.surface || '') as Surface
      if (!(surface in ACCOUNT_IDENTIFIERS) || !body.inboxId) {
        return NextResponse.json({ error: 'inboxId and surface (homepage|inapp) required' }, { status: 400 })
      }
      return NextResponse.json(await hsFetch(`${CHANNELS_BASE}/${hubspotChatEnv.channelId}/channel-accounts`, {
        method: 'POST',
        json: {
          inboxId: String(body.inboxId),
          name: surface === 'homepage' ? 'Steven — Website' : 'Steven — DA Platform',
          deliveryIdentifier: { type: 'CHANNEL_SPECIFIC_OPAQUE_ID', value: ACCOUNT_IDENTIFIERS[surface] },
          authorized: true,
        },
      }))
    }
    case 'refresh-note': {
      const id = String(body.conversationId || '')
      if (!id) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
      refreshCompanyChatNote(id)
      return NextResponse.json({ ok: true, queued: id })
    }
    case 'recent-threads': {
      const inbox = hubspotChatEnv.channelId ? (body.inboxId ? String(body.inboxId) : '215856600') : '215856600'
      const since = new Date(Date.now() - (Number(body.hours) || 6) * 3600_000).toISOString()
      const t = await hsFetch(`/conversations/v3/conversations/threads?inboxId=${encodeURIComponent(inbox)}&sort=latestMessageTimestamp&latestMessageTimestampAfter=${encodeURIComponent(since)}&limit=${Number(body.limit) || 10}`)
      if (!t.ok) return NextResponse.json({ status: t.status, error: t.data })
      const threads = ((t.data as { results?: Record<string, unknown>[] })?.results) || []
      const out = []
      for (const th of threads) {
        const m = await hsFetch(`/conversations/v3/conversations/threads/${th.id}/messages?limit=8&sort=-createdAt`)
        out.push({
          id: th.id, status: th.status, originalChannelId: th.originalChannelId, originalChannelAccountId: th.originalChannelAccountId,
          latest: th.latestMessageTimestamp,
          messages: (((m.data as { results?: Record<string, unknown>[] })?.results) || []).map((x) => ({
            type: x.type, direction: x.direction, createdAt: x.createdAt, channelId: x.channelId, channelAccountId: x.channelAccountId,
            text: typeof x.text === 'string' ? x.text.slice(0, 80) : null,
            status: (x.status as { statusType?: string } | undefined)?.statusType,
            failure: (x.status as { failureDetails?: unknown } | undefined)?.failureDetails ?? null,
          })),
        })
      }
      return NextResponse.json({ status: t.status, threads: out })
    }
    default:
      return NextResponse.json({ error: `unknown action ${action}` }, { status: 400 })
  }
}
