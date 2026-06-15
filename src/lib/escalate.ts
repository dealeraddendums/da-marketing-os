import { Resend } from 'resend'

// "Talk to a real person" escalation: instant Slack alert with full chat
// context so the team can call/email/loop back fast. Reliability is the point —
// if Slack fails, fall back to an urgent email; an escalation must NEVER be
// silently lost. Deduped to ONE alert per session (button + intent both route
// here). NOT live-chat takeover — that's a separate, larger build.

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

// In-process dedupe (da-marketing runs single-instance fork mode). Best-effort:
// a rare duplicate after a restart is acceptable; a missed alert is not.
const seen = new Map<string, number>()
const DEDUP_TTL_MS = 60 * 60 * 1000
function alreadyEscalated(sessionId: string): boolean {
  const now = Date.now()
  seen.forEach((t, k) => { if (now - t > DEDUP_TTL_MS) seen.delete(k) })
  if (seen.has(sessionId)) return true
  seen.set(sessionId, now)
  return false
}

function transcriptTail(messages: EscalateInput['messages'], n = 6): string {
  if (!messages?.length) return '(no transcript)'
  return messages.slice(-n)
    .map(m => `${m.role === 'assistant' ? 'Bot' : 'Visitor'}: ${(m.content || '').slice(0, 300)}`)
    .join('\n')
}

async function postSlack(url: string, input: EscalateInput): Promise<boolean> {
  const contact = [
    input.name && `*${input.name}*`,
    input.dealership,
    input.email,
    input.phone,
  ].filter(Boolean).join(' · ') || 'not given'
  const ctx = [
    input.page && `Page: ${input.page}`,
    input.utm?.utm_source && `Source: ${input.utm.utm_source}`,
    input.utm?.utm_campaign && `Campaign: ${input.utm.utm_campaign}`,
    input.utm?.utm_term && `Term: ${input.utm.utm_term}`,
  ].filter(Boolean).join(' · ') || 'no page/UTM context'

  // Flat top-level keys for a Slack Workflow Builder webhook trigger. Each key
  // maps 1:1 to a Data Variable declared in the workflow; the workflow's
  // "send message" step formats them. (Plain text — Workflow Builder doesn't
  // render Block Kit.) `text` is a harmless fallback if pointed at a classic
  // Incoming Webhook instead. All keys ALWAYS present so no declared variable
  // comes through empty/undefined.
  const payload = {
    headline: '🔴 Live chat — human requested',
    contact,
    context: ctx,
    transcript: transcriptTail(input.messages),
    requested_at: `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    trigger: input.trigger || 'intent',
    text: `🔴 Live chat — human requested — ${contact}`,
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
  if (!process.env.RESEND_API_KEY) return false
  try {
    const to = process.env.LEAD_NOTIFY_EMAIL || 'allan@dealeraddendums.com'
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'DealerAddendums <noreply@dealeraddendums.com>',
      to,
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

export async function escalateLead(input: EscalateInput): Promise<{ ok: boolean; channel: 'slack' | 'email' | 'none'; deduped?: boolean }> {
  const sid = input.sessionId || `anon-${Date.now()}`
  if (alreadyEscalated(sid)) return { ok: true, channel: 'none', deduped: true }

  const url = process.env.SLACK_LEADS_WEBHOOK_URL
  if (url && (await postSlack(url, input))) return { ok: true, channel: 'slack' }

  if (await emailFallback(input)) {
    console.error('[escalate] Slack unavailable — delivered via email fallback for session', sid)
    return { ok: true, channel: 'email' }
  }

  // Both channels down/unconfigured — must be loud, never silent.
  console.error('[escalate] ‼️ ESCALATION NOT DELIVERED (no Slack webhook + no email) for session', sid, '— contact:', input.email || input.phone || 'unknown')
  return { ok: false, channel: 'none' }
}

// Server-side intent: visitor asking for a human/sales rep/callback.
const HUMAN_INTENT = /\b(real person|speak (to|with) (someone|a person|a human)|talk to (a )?(human|person|someone|sales|rep|representative|agent)|human (agent|rep|being)|call me|give me a call|phone call|sales rep|sales representative|contact me|reach out to me)\b/i
export function wantsHuman(text: string): boolean {
  return HUMAN_INTENT.test(text || '')
}
