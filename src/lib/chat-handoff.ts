import { postSlackMessage } from '@/lib/slack'
import { refreshCompanyChatNote } from '@/lib/chat-crm-log'
import { type ChatConversation } from '@/lib/chat-store'
import { type ChatAttachment } from '@/lib/chat-files'
import {
  publishVisitorMessage, uploadToHubSpotFiles, type HsAttachment,
} from '@/lib/hubspot-chat/client'

// The two live hand-off destinations behind one interface. A conversation
// remembers which one it went live on (handoff_provider), so every later
// visitor message follows it there — flipping CHAT_HANDOFF_PROVIDER mid-chat
// never splits a conversation across Slack and HubSpot.

export interface HandoffContext {
  name?: string | null
  dealership?: string | null
  email?: string | null
  phone?: string | null
  page?: string | null
  utm?: Record<string, string | null> | null
  messages?: { role: string; content: string }[]
}

function line(parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ')
}

/** The first message an agent sees: who, where from, and the whole bot
 *  conversation, so nobody has to ask the visitor to repeat themselves. */
export function handoffSummaryText(ctx: HandoffContext): string {
  const turns = (ctx.messages || [])
    .filter(m => (m.content || '').trim())
    .slice(-30)
    .map(m => `${m.role === 'assistant' ? 'Steven' : 'Visitor'}: ${m.content.trim().slice(0, 600)}`)
  return [
    'Live chat — the visitor asked for a person.',
    `Contact: ${line([ctx.name, ctx.dealership, ctx.email, ctx.phone]) || 'not given'}`,
    line([
      ctx.page && `Page: ${ctx.page}`,
      ctx.utm?.utm_source && `Source: ${ctx.utm.utm_source}`,
      ctx.utm?.utm_campaign && `Campaign: ${ctx.utm.utm_campaign}`,
      ctx.utm?.utm_term && `Term: ${ctx.utm.utm_term}`,
    ]),
    '',
    '— Conversation with Steven —',
    ...(turns.length ? turns : ['(no transcript)']),
  ].filter(l => l !== undefined).join('\n').slice(0, 15000)
}

/** Open the HubSpot inbox thread for a conversation by publishing the summary.
 *  Our conversation id IS the thread id (INTEGRATION_THREAD_ID threading). */
export async function openHubspotThread(
  convo: ChatConversation,
  ctx: HandoffContext,
): Promise<{ ok: boolean; error?: string }> {
  const r = await publishVisitorMessage({
    surface: 'homepage',
    threadId: convo.id,
    idempotencyId: `${convo.id}:open`,
    text: handoffSummaryText(ctx),
    visitorName: ctx.name || ctx.dealership || null,
    visitorEmail: ctx.email || null,
    visitorKey: `web-${convo.session_id}`,
  })
  if (!r.ok) console.error('[handoff] HubSpot thread open failed:', r.error)
  return r
}

function usageType(mime: string): HsAttachment['fileUsageType'] {
  return mime.startsWith('image/') ? 'IMAGE' : 'OTHER'
}

/**
 * Relay a visitor message (and any files) to wherever the conversation is live.
 * The message is already persisted by the caller; a relay failure is logged
 * and reported, never thrown, so the visitor's own view stays intact.
 */
export async function relayVisitorMessage(
  convo: ChatConversation,
  msg: { id: string; text: string; files?: { att: ChatAttachment; bytes: Buffer }[] },
): Promise<{ ok: boolean; error?: string }> {
  if (convo.handoff_provider === 'hubspot') {
    const attachments: HsAttachment[] = []
    for (const f of msg.files || []) {
      const up = await uploadToHubSpotFiles({ bytes: f.bytes, fileName: f.att.name, mime: f.att.mime })
      if (up.ok && up.fileId) attachments.push({ type: 'FILE', fileId: up.fileId, fileUsageType: usageType(f.att.mime) })
      else console.error('[handoff] HubSpot file upload failed:', up.error)
    }
    const r = await publishVisitorMessage({
      surface: 'homepage',
      threadId: convo.id,
      idempotencyId: msg.id,
      text: msg.text || (msg.files?.length ? `Sent ${msg.files.map(f => f.att.name).join(', ')}` : ' '),
      visitorName: convo.contact_name || convo.dealership || null,
      visitorEmail: convo.contact_email,
      visitorKey: `web-${convo.session_id}`,
      attachments,
    })
    if (!r.ok) console.error('[handoff] HubSpot relay failed:', r.error)
    refreshCompanyChatNote(convo.id)
    return r
  }

  // Slack (and Slack-era rows with no provider recorded).
  if (convo.slack_channel && convo.slack_thread_ts) {
    const fileNote = msg.files?.length
      ? `\n📎 ${msg.files.map(f => f.att.name).join(', ')} (file sharing works in the HubSpot inbox only)`
      : ''
    const res = await postSlackMessage({
      channel: convo.slack_channel,
      threadTs: convo.slack_thread_ts,
      text: `💬 *Visitor:* ${(msg.text || '').slice(0, 2000)}${fileNote}`,
    })
    if (!res.ok) console.error('[handoff] Slack relay failed:', res.error)
    return { ok: res.ok, error: res.error }
  }
  return { ok: false, error: 'conversation has no hand-off destination' }
}
