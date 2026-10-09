import { NextRequest, NextResponse } from 'next/server'
import { getMessagesAfter, getLatestAgent } from '@/lib/chat-store'
import { postToPlatform } from '@/lib/hubspot-chat/platform-auth'

// Agent email → staff headshot URL (da-platform resolves; staff accounts only).
// Cached a minute so a 3-second poll isn't a platform call each time.
const photoCache = new Map<string, { at: number; url: string | null }>()
async function agentPhotos(emails: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const need = Array.from(new Set(emails)).filter((e) => {
    const c = photoCache.get(e)
    if (c && Date.now() - c.at < 60_000) { out.set(e, c.url); return false }
    return true
  })
  if (need.length) {
    const r = await postToPlatform('/api/help/agent-profiles', { emails: need }, 5_000).catch(() => null)
    const photos = (r?.ok ? (r.data as { photos?: Record<string, string> })?.photos : null) ?? {}
    for (const e of need) {
      const url = photos[e] ?? null
      if (r?.ok) photoCache.set(e, { at: Date.now(), url })
      out.set(e, url)
    }
  }
  return out
}

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
    // `agent` is re-resolved on EVERY poll (not only when a reply arrives), so a
    // headshot saved after the agent first replied still shows in the header.
    const latest = await getLatestAgent(conversationId)
    const latestEmail = (latest?.sender_email || '').trim().toLowerCase()
    const emails = [...msgs.map(m => (m.sender_email || '').trim().toLowerCase()), latestEmail].filter(Boolean)
    const photos = emails.length ? await agentPhotos(emails) : new Map<string, string | null>()
    return NextResponse.json({
      messages: msgs.map(m => ({
        id: m.id, role: m.role, body: m.body, created_at: m.created_at,
        sender: m.sender_name || null,
        // The agent's staff headshot for the takeover header; the email stays here.
        senderPhoto: photos.get((m.sender_email || '').trim().toLowerCase()) ?? null,
        // Links go through /api/chat/file, which signs on demand — a signed
        // URL minted here would expire while the chat sits open.
        attachments: (m.attachments || []).map((a, i) => ({
          name: a.name, mime: a.mime, size: a.size,
          url: `/api/chat/file?conversation=${encodeURIComponent(conversationId)}&message=${encodeURIComponent(m.id)}&i=${i}`,
        })),
      })),
      at: cursor,
      agent: latest ? { name: latest.sender_name, photo: photos.get(latestEmail) ?? null } : null,
    })
  } catch (e) {
    console.error('[chat/poll] failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ messages: [], at: cursor })
  }
}
