import { NextRequest, NextResponse } from 'next/server'
import { getMessagesAfter } from '@/lib/chat-store'

export const dynamic = 'force-dynamic'
// Next 14 still caches supabase-js GETs in the Data Cache under force-dynamic: a
// poll that once read "no new messages" kept getting that answer forever, so
// agent replies never reached the widget. Every chat read must be live.
export const fetchCache = 'force-no-store'

/**
 * GET /api/chat/poll?conversation=&after= — new agent/system messages since the
 * `after` ISO cursor (service-role). The widget polls this every ~3s while live.
 * Returns { messages: [{id, role, body, created_at}], at } where `at` is the
 * cursor to use on the next poll (the newest created_at, else the one passed in).
 */
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversation') || ''
  const after = req.nextUrl.searchParams.get('after') || '1970-01-01T00:00:00.000Z'
  if (!conversationId) {
    return NextResponse.json({ error: 'conversation required' }, { status: 400 })
  }

  let cursor = after
  try {
    const msgs = await getMessagesAfter(conversationId, after)
    if (msgs.length) cursor = msgs[msgs.length - 1].created_at
    return NextResponse.json({
      messages: msgs.map(m => ({
        id: m.id, role: m.role, body: m.body, created_at: m.created_at,
        sender: m.sender_name || null,
        // Links go through /api/chat/file, which signs on demand — a signed
        // URL minted here would expire while the chat sits open.
        attachments: (m.attachments || []).map((a, i) => ({
          name: a.name, mime: a.mime, size: a.size,
          url: `/api/chat/file?conversation=${encodeURIComponent(conversationId)}&message=${encodeURIComponent(m.id)}&i=${i}`,
        })),
      })),
      at: cursor,
    })
  } catch (e) {
    console.error('[chat/poll] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ messages: [], at: cursor })
  }
}
