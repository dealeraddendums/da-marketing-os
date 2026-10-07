import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { relayVisitorMessage } from '@/lib/chat-handoff'
import { getConversationById, insertMessage } from '@/lib/chat-store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/message — a visitor message while the conversation is LIVE.
 * Persists role='visitor' and relays it to wherever the conversation went live
 * (HubSpot inbox or Slack thread) so the agent sees it. Bot-mode messages keep using the existing /api/chat streaming route.
 * Body: { conversationId, body }.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!conversationId || !text) {
    return NextResponse.json({ error: 'conversationId and body required' }, { status: 400 })
  }

  const convo = await getConversationById(conversationId)
  if (!convo) return NextResponse.json({ error: 'conversation not found' }, { status: 404 })
  // Only relay while live. If it isn't live the widget should be using the bot.
  if (convo.status !== 'live') {
    return NextResponse.json({ error: 'not_live', status: convo.status }, { status: 409 })
  }

  const saved = await insertMessage(convo.id, 'visitor', text.slice(0, 2000))

  // Relay (best-effort — the message is already persisted).
  await relayVisitorMessage(convo, { id: saved?.id || `${convo.id}:${Date.now()}`, text: text.slice(0, 2000) })

  return NextResponse.json({ ok: true })
}
