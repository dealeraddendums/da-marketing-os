import { sendMandrillEmail } from '@/lib/mandrill'
import { postSlackMessage, slackConfigured } from '@/lib/slack'
import {
  findOrCreateConversation,
  setConversationLive,
  type ChatConversation,
} from '@/lib/chat-store'

// "Talk to a real person" escalation. TWO-WAY now: the bot-token alert becomes
// the parent of a Slack thread; the team replies in-thread and the visitor sees
// it live in the widget (Slack Events → /api/chat/slack-events) and replies back
// (/api/chat/message). The conversation flips to `live` and the bot stops
// auto-answering. If the bot token isn't configured, we degrade to the legacy
// notify-only path (Workflow Builder webhook → email): an alert is sent but the
// widget stays in bot mode (no conversationId returned). An escalation must
// NEVER be silently lost.

export interface EscalateInput {
  sessionId?: string | null
  messages?: { role: string; content: string }[]
  name?: string | null
  email?: string | null
  phone?: string | null
  dealership?: string | null
  page?: string | null
  utm?: Record<string, string | null> | null
  trigger?: 'button' | 'intent'
}

export interface EscalateResult {
  ok: boolean
  channel: 'slack' | 'email' | 'none'
  deduped?: boolean
  // Present only when two-way live mode engaged (bot-token post succeeded):
  live?: boolean
  conversationId?: string
  threadTs?: string
  at?: string // ISO cursor — widget polls /api/chat/poll for messages after this
}

function contactLine(input: EscalateInput): string {
  return [
    input.name && `*${input.name}*`,
    input.dealership,
    input.email,
    input.phone,
  ].filter(Boolean).join(' · ') || 'not given'
}

function contextLine(input: EscalateInput): string {
  return [
    input.page && `Page: ${input.page}`,
    input.utm?.utm_source && `Source: ${input.utm.utm_source}`,
    input.utm?.utm_campaign && `Campaign: ${input.utm.utm_campaign}`,
    input.utm?.utm_term && `Term: ${input.utm.utm_term}`,
  ].filter(Boolean).join(' · ') || 'no page/UTM context'
}

function transcriptTail(messages: EscalateInput['messages'], n = 8): string {
  if (!messages?.length) return '(no transcript)'
  return messages.slice(-n)
    .map(m => `${m.role === 'assistant' ? 'Bot' : 'Visitor'}: ${(m.content || '').slice(0, 300)}`)
    .join('\n')
}

// ── Two-way: post the threaded parent with the bot token ────────────────────
async function postThreadParent(input: EscalateInput): Promise<{ ts: string; channel: string } | null> {
  const channel = process.env.SLACK_ALERTS_CHANNEL!
  const text = [
    '🔴 *Live chat — human requested*',
    `Contact: ${contactLine(input)}`,
    contextLine(input),
    '',
    '*Transcript*',
    '```',
    transcriptTail(input.messages),
    '```',
    '_Reply in this thread to talk to the visitor live._',
  ].join('\n')
  const res = await postSlackMessage({ channel, text })
  if (!res.ok || !res.ts) {
    console.error('[escalate] bot-token postMessage failed:', res.error)
    return null
  }
  return { ts: res.ts, channel: res.channel || channel }
}

// ── Legacy fallback: Workflow Builder / Incoming Webhook (notify-only) ──────
async function postWebhook(url: string, input: EscalateInput): Promise<boolean> {
  const payload = {
    headline: '🔴 Live chat — human requested',
    contact: contactLine(input).replace(/\*/g, ''),
    context: contextLine(input),
    transcript: transcriptTail(input.messages, 6),
    requested_at: `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    trigger: input.trigger || 'intent',
    text: `🔴 Live chat — human requested — ${contactLine(input).replace(/\*/g, '')}`,
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function emailFallback(input: EscalateInput): Promise<boolean> {
  if (!process.env.MANDRILL_API_KEY) return false
  try {
    const to = process.env.LEAD_NOTIFY_EMAIL || 'allan@dealeraddendums.com'
    await sendMandrillEmail({
      from_email: 'noreply@dealeraddendums.com',
      from_name: 'DealerAddendums',
      to: [{ email: to }],
      subject: `🔴 URGENT — live chat human requested${input.name ? ` (${input.name})` : ''}`,
      html: `<div style="font-family:Roboto,sans-serif;font-size:14px;color:#333">
        <p><strong>A website chat visitor asked to talk to a person.</strong> (Slack alert failed — email fallback.)</p>
        <p>Contact: ${input.name || '—'} · ${input.dealership || '—'} · ${input.email || '—'} · ${input.phone || '—'}</p>
        <p>Page: ${input.page || '—'}</p>
        <pre style="white-space:pre-wrap;background:#f5f6f7;padding:10px;border-radius:6px">${
          (input.messages || []).slice(-6).map(m => `${m.role}: ${m.content}`).join('\n').replace(/[<>]/g, '')
        }</pre>
      </div>`,
    })
    return true
  } catch {
    return false
  }
}

export async function escalateLead(input: EscalateInput): Promise<EscalateResult> {
  const sid = input.sessionId || `anon-${Date.now()}`

  // ── Two-way path: needs the bot token + alerts channel ───────────────────
  if (slackConfigured()) {
    let convo: ChatConversation | null = null
    try {
      convo = await findOrCreateConversation(sid, {
        page: input.page, email: input.email, phone: input.phone,
      })
    } catch (e) {
      console.error('[escalate] conversation lookup failed:', e instanceof Error ? e.message : e)
    }

    if (convo) {
      // Already escalated (button after intent, or a repeat tap) — return the
      // existing thread without re-alerting. Dedupe lives in the row's status.
      if (convo.status === 'live' && convo.slack_thread_ts) {
        return {
          ok: true, channel: 'slack', deduped: true, live: true,
          conversationId: convo.id, threadTs: convo.slack_thread_ts,
          at: new Date().toISOString(),
        }
      }
      const parent = await postThreadParent(input)
      if (parent) {
        await setConversationLive(convo.id, parent.ts, parent.channel)
        return {
          ok: true, channel: 'slack', live: true,
          conversationId: convo.id, threadTs: parent.ts,
          at: new Date().toISOString(),
        }
      }
      // Bot-token post failed — fall through to the legacy alert below so the
      // team is still notified, but the widget stays in bot mode.
    }
  }

  // ── Legacy notify-only fallback (webhook → email) ────────────────────────
  const url = process.env.SLACK_LEADS_WEBHOOK_URL
  if (url && (await postWebhook(url, input))) return { ok: true, channel: 'slack' }

  if (await emailFallback(input)) {
    console.error('[escalate] Slack unavailable — delivered via email fallback for session', sid)
    return { ok: true, channel: 'email' }
  }

  console.error('[escalate] ‼️ ESCALATION NOT DELIVERED (no Slack + no email) for session', sid, '— contact:', input.email || input.phone || 'unknown')
  return { ok: false, channel: 'none' }
}

// Server-side intent: visitor asking for a human/sales rep/callback.
const HUMAN_INTENT = /\b(real person|speak (to|with) (someone|a person|a human)|talk to (a )?(human|person|someone|sales|rep|representative|agent)|human (agent|rep|being)|call me|give me a call|phone call|sales rep|sales representative|contact me|reach out to me)\b/i
export function wantsHuman(text: string): boolean {
  return HUMAN_INTENT.test(text || '')
}
