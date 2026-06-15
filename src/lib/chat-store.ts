import { supabase } from '@/lib/supabase'

// Persistence for two-way live chat (migration 008). Service-role only — all
// access is server-side; the widget never touches Supabase directly (it polls
// /api/chat/poll). See chat-live-twoway.md.

export interface ChatConversation {
  id: string
  session_id: string
  status: 'bot' | 'live' | 'closed'
  slack_thread_ts: string | null
  slack_channel: string | null
  contact_email: string | null
  contact_phone: string | null
  page: string | null
  created_at: string
  last_message_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: 'visitor' | 'bot' | 'agent' | 'system'
  body: string
  created_at: string
}

/** Find the conversation for a browser session, creating it if absent. */
export async function findOrCreateConversation(
  sessionId: string,
  fields: { page?: string | null; email?: string | null; phone?: string | null } = {},
): Promise<ChatConversation | null> {
  const { data: existing } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle()
  if (existing) return existing as ChatConversation

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      session_id: sessionId,
      status: 'bot',
      page: fields.page || null,
      contact_email: fields.email || null,
      contact_phone: fields.phone || null,
    })
    .select('*')
    .single()
  if (error) {
    // Lost an insert race on the unique session_id — re-read the winner.
    const { data: again } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle()
    return (again as ChatConversation) || null
  }
  return data as ChatConversation
}

export async function getConversationById(id: string): Promise<ChatConversation | null> {
  const { data } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', id)
    .limit(1)
    .maybeSingle()
  return (data as ChatConversation) || null
}

export async function getConversationByThreadTs(threadTs: string): Promise<ChatConversation | null> {
  const { data } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('slack_thread_ts', threadTs)
    .limit(1)
    .maybeSingle()
  return (data as ChatConversation) || null
}

/** Mark a conversation live and anchor it to the Slack thread. */
export async function setConversationLive(
  id: string,
  slackThreadTs: string,
  slackChannel: string,
): Promise<void> {
  await supabase
    .from('chat_conversations')
    .update({ status: 'live', slack_thread_ts: slackThreadTs, slack_channel: slackChannel, last_message_at: new Date().toISOString() })
    .eq('id', id)
}

export async function insertMessage(
  conversationId: string,
  role: ChatMessage['role'],
  body: string,
): Promise<ChatMessage | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role, body })
    .select('*')
    .single()
  if (error) {
    console.error('[chat-store] insertMessage failed:', error.message)
    return null
  }
  // Bump the conversation's activity clock (best-effort).
  await supabase.from('chat_conversations').update({ last_message_at: now }).eq('id', conversationId)
  return data as ChatMessage
}

/** Agent/system messages newer than the cursor — what the widget polls for. */
export async function getMessagesAfter(conversationId: string, afterIso: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .in('role', ['agent', 'system'])
    .gt('created_at', afterIso)
    .order('created_at', { ascending: true })
    .limit(50)
  return (data as ChatMessage[]) || []
}
