import { supabase } from '@/lib/supabase'
import type { ChatAttachment } from '@/lib/chat-files'

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
  // Migration 016 (HubSpot bridge). handoff_provider NULL = Slack-era row.
  handoff_provider: 'slack' | 'hubspot' | null
  hubspot_thread_id: string | null
  contact_name: string | null
  dealership: string | null
  live_at: string | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: 'visitor' | 'bot' | 'agent' | 'system'
  body: string
  created_at: string
  attachments: ChatAttachment[]
  sender_name: string | null
  external_id: string | null
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

/** Mark a conversation live on a hand-off provider. For Slack the thread ts +
 *  channel anchor inbound replies; for HubSpot our own conversation id is the
 *  thread id, so nothing else is needed to route replies back. */
export async function setConversationLive(
  id: string,
  live: {
    provider: 'slack' | 'hubspot'
    slackThreadTs?: string
    slackChannel?: string
    contactName?: string | null
    dealership?: string | null
    email?: string | null
    phone?: string | null
  },
): Promise<string> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: 'live', handoff_provider: live.provider, live_at: now, last_message_at: now,
  }
  if (live.slackThreadTs) patch.slack_thread_ts = live.slackThreadTs
  if (live.slackChannel) patch.slack_channel = live.slackChannel
  if (live.contactName) patch.contact_name = live.contactName
  if (live.dealership) patch.dealership = live.dealership
  if (live.email) patch.contact_email = live.email
  if (live.phone) patch.contact_phone = live.phone
  await supabase.from('chat_conversations').update(patch).eq('id', id)
  return now
}

export async function insertMessage(
  conversationId: string,
  role: ChatMessage['role'],
  body: string,
  extra: { attachments?: ChatAttachment[]; senderName?: string | null; externalId?: string | null } = {},
): Promise<ChatMessage | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId, role, body,
      attachments: extra.attachments ?? [],
      sender_name: extra.senderName ?? null,
      external_id: extra.externalId ?? null,
    })
    .select('*')
    .single()
  if (error) {
    // 23505 on external_id = a retried webhook for a reply already stored.
    if (error.code === '23505') return null
    console.error('[chat-store] insertMessage failed:', error.message)
    return null
  }
  // Bump the conversation's activity clock (best-effort).
  await supabase.from('chat_conversations').update({ last_message_at: now }).eq('id', conversationId)
  return data as ChatMessage
}

export async function setHubspotThreadId(id: string, hubspotThreadId: string): Promise<void> {
  await supabase.from('chat_conversations')
    .update({ hubspot_thread_id: hubspotThreadId })
    .eq('id', id)
    .is('hubspot_thread_id', null)
}

export async function getConversationBySession(sessionId: string): Promise<ChatConversation | null> {
  const { data } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle()
  return (data as ChatConversation) || null
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
