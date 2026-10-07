import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { getConversationById, insertMessage } from '@/lib/chat-store'
import { storeChatFile, ALLOWED_CHAT_MIME, MAX_CHAT_FILE_BYTES } from '@/lib/chat-files'
import { relayVisitorMessage } from '@/lib/chat-handoff'

export const dynamic = 'force-dynamic'
// Next 14 still caches supabase-js GETs in the Data Cache under force-dynamic: a
// poll that once read "no new messages" kept getting that answer forever, so
// agent replies never reached the widget. Every chat read must be live.
export const fetchCache = 'force-no-store'

/**
 * POST /api/chat/upload — a visitor sends a file while LIVE (multipart:
 * conversationId, file, optional body). Stored in our private bucket, then
 * relayed: HubSpot gets it as a Files attachment on the inbox thread.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`upload:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many uploads — try again in a minute.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'bad_form' }, { status: 400 })
  }
  const conversationId = String(form.get('conversationId') || '')
  const file = form.get('file')
  const caption = String(form.get('body') || '').trim().slice(0, 2000)
  if (!conversationId || !(file instanceof File)) {
    return NextResponse.json({ error: 'conversationId and file required' }, { status: 400 })
  }
  if (file.size > MAX_CHAT_FILE_BYTES) {
    return NextResponse.json({ error: 'File is too large (10 MB max).' }, { status: 413 })
  }
  if (!ALLOWED_CHAT_MIME.has(file.type)) {
    return NextResponse.json({ error: 'That file type can’t be sent — try an image, PDF, or Office document.' }, { status: 415 })
  }

  const convo = await getConversationById(conversationId)
  if (!convo) return NextResponse.json({ error: 'conversation not found' }, { status: 404 })
  if (convo.status !== 'live') return NextResponse.json({ error: 'not_live' }, { status: 409 })

  const bytes = Buffer.from(await file.arrayBuffer())
  let att
  try {
    att = await storeChatFile({ conversationId: convo.id, name: file.name, mime: file.type, bytes })
  } catch (e) {
    console.error('[chat/upload] store failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Upload failed — please try again.' }, { status: 500 })
  }

  const saved = await insertMessage(convo.id, 'visitor', caption, { attachments: [att] })
  const relay = await relayVisitorMessage(convo, {
    id: saved?.id || `${convo.id}:${Date.now()}`, text: caption, files: [{ att, bytes }],
  })

  return NextResponse.json({ ok: true, relayed: relay.ok, attachment: { name: att.name, mime: att.mime, size: att.size } })
}
