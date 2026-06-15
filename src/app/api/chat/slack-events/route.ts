import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack'
import { getConversationByThreadTs, insertMessage } from '@/lib/chat-store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/slack-events — Slack Events API handler for two-way live chat.
 *
 * - Verifies the request signature against SLACK_SIGNING_SECRET (raw body).
 * - Answers the one-time url_verification challenge.
 * - On a thread reply whose thread_ts maps to a live conversation — and NOT from
 *   our own bot (loop guard) — inserts a role='agent' message the widget polls.
 * - ALWAYS acks 200 fast (Slack retries non-2xx within 3s); heavy work is kept
 *   minimal and the ack is never blocked on it.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const ok = verifySlackSignature(
    raw,
    req.headers.get('x-slack-request-timestamp'),
    req.headers.get('x-slack-signature'),
  )
  if (!ok) return NextResponse.json({ error: 'bad_signature' }, { status: 401 })

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  // URL verification handshake (Slack sends this when you save the Request URL).
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  if (payload.type === 'event_callback') {
    const event = payload.event as Record<string, unknown> | undefined
    // Process only genuine in-thread human replies. Skip:
    //  - non-message events
    //  - our own bot's messages (bot_id / app self) → loop guard
    //  - edits/deletes/joins and other subtypes
    //  - top-level (non-threaded) messages
    if (
      event &&
      event.type === 'message' &&
      !event.bot_id &&
      !event.subtype &&
      typeof event.thread_ts === 'string' &&
      typeof event.text === 'string' &&
      (event.text as string).trim()
    ) {
      const threadTs = event.thread_ts as string
      const text = (event.text as string).trim()
      // Defer the DB work but still finish well under Slack's 3s budget.
      try {
        const convo = await getConversationByThreadTs(threadTs)
        if (convo && convo.status === 'live') {
          await insertMessage(convo.id, 'agent', text)
        }
      } catch (e) {
        // Never fail the ack — Slack would retry and we'd double-insert.
        console.error('[slack-events] relay failed:', e instanceof Error ? e.message : e)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
