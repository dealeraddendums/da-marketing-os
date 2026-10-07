import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { signedChatFileUrl } from '@/lib/chat-files'

export const dynamic = 'force-dynamic'

/**
 * GET /api/chat/file?conversation=&message=&i= — redirect to a 5-minute signed
 * URL for one attachment. Same access model as /api/chat/poll: holding the
 * (unguessable) conversation id is what lets a widget read its own chat. The
 * path is looked up from the message row, never taken from the query, so a
 * caller cannot walk the bucket.
 */
export async function GET(req: NextRequest) {
  const conversation = req.nextUrl.searchParams.get('conversation') || ''
  const message = req.nextUrl.searchParams.get('message') || ''
  const i = Number(req.nextUrl.searchParams.get('i') || '0')
  if (!conversation || !message || !Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  const { data } = await supabase
    .from('chat_messages')
    .select('attachments')
    .eq('id', message)
    .eq('conversation_id', conversation)
    .maybeSingle()
  const att = (data?.attachments as { path?: string }[] | undefined)?.[i]
  if (!att?.path) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const url = await signedChatFileUrl(att.path)
  if (!url) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.redirect(url)
}
