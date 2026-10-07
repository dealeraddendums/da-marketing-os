import { supabase } from '@/lib/supabase'

// Files exchanged in a live chat (visitor uploads + copies of agent
// attachments), kept in a PRIVATE Supabase Storage bucket on this project.
// Browsers never get a bucket path — they get a short-lived signed URL from
// /api/chat/file, which checks the file belongs to the conversation asked for.

export const CHAT_BUCKET = 'chat-attachments'
export const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024

/** Images, PDFs, plain text and Office documents — what support actually
 *  trades. Anything executable or scriptable (html, svg, js) is refused, since
 *  these are later opened in an agent's or visitor's browser. */
export const ALLOWED_CHAT_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export interface ChatAttachment {
  name: string
  mime: string
  size: number
  path: string
}

function safeName(name: string): string {
  return (name || 'file').replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file'
}

export async function storeChatFile(opts: {
  conversationId: string
  name: string
  mime: string
  bytes: Buffer
}): Promise<ChatAttachment> {
  const path = `${opts.conversationId}/${Date.now()}-${safeName(opts.name)}`
  const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, opts.bytes, {
    contentType: opts.mime, upsert: false,
  })
  if (error) throw new Error(`storing chat file: ${error.message}`)
  return { name: safeName(opts.name), mime: opts.mime, size: opts.bytes.length, path }
}

export async function signedChatFileUrl(path: string, seconds = 300): Promise<string | null> {
  const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrl(path, seconds)
  return data?.signedUrl || null
}
