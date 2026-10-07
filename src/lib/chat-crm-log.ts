import { supabase } from '@/lib/supabase'
import type { ChatConversation, ChatMessage } from '@/lib/chat-store'

// Files a live chat on the dealer's COMPANY timeline in HubSpot.
//
// HubSpot puts a custom-channel thread on the CONTACT's timeline only — a
// closed test chat never reached the company's Activity (verified 2026-10-07).
// So each conversation maintains ONE note, associated to every company the
// contact belongs to, rewritten with the full transcript whenever the chat
// moves. Not associated to the contact: the contact already shows the thread
// itself, and a second copy there would just be noise.
//
// Uses the marketing site's existing private-app token (HUBSPOT_API_KEY: it
// holds crm.objects.companies.write + contacts.read, which is all this needs).
// Best-effort throughout — a CRM hiccup never affects the chat.

const BASE = 'https://api.hubapi.com'
const NOTE_TO_COMPANY = 190 // HUBSPOT_DEFINED note → company

function headers() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function contactIdFor(convo: ChatConversation): Promise<string | null> {
  if (convo.hubspot_contact_id) return convo.hubspot_contact_id
  if (!convo.contact_email) return null
  const res = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST', headers: headers(), cache: 'no-store',
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: convo.contact_email.toLowerCase() }] }],
      limit: 1,
    }),
  })
  if (!res.ok) return null
  const id = (await res.json())?.results?.[0]?.id
  return id ? String(id) : null
}

async function companyIdsFor(contactId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/crm/v4/objects/contacts/${contactId}/associations/companies`, {
    headers: headers(), cache: 'no-store',
  })
  if (!res.ok) return []
  const rows = ((await res.json())?.results || []) as { toObjectId: number | string }[]
  return rows.map(r => String(r.toObjectId))
}

function noteBody(convo: ChatConversation, msgs: ChatMessage[]): string {
  const who = [convo.contact_name, convo.dealership, convo.contact_email, convo.contact_phone].filter(Boolean).join(' · ')
  const live = msgs.map(m => {
    const name = m.role === 'agent' ? (m.sender_name || 'DA Team') : m.role === 'visitor' ? 'Visitor' : 'System'
    const files = (m.attachments || []).map(a => `📎 ${a.name}`).join(', ')
    return `<p><strong>${esc(name)}:</strong> ${esc(m.body || '')}${files ? ` ${esc(files)}` : ''}</p>`
  }).join('')
  return [
    `<p><strong>Live chat (website, Steven hand-off)</strong> — ${esc(new Date(convo.live_at || convo.created_at).toUTCString())}</p>`,
    who ? `<p>${esc(who)}</p>` : '',
    convo.handoff_summary ? `<pre style="white-space:pre-wrap">${esc(convo.handoff_summary)}</pre>` : '',
    live ? `<p><strong>— With our team —</strong></p>${live}` : '',
    convo.hubspot_thread_id
      ? `<p><a href="https://app.hubspot.com/live-messages/${process.env.HUBSPOT_PORTAL_ID || '23896347'}/inbox/${convo.hubspot_thread_id}">Open the conversation in the inbox</a></p>`
      : '',
  ].join('').slice(0, 60000)
}

async function writeNote(conversationId: string): Promise<void> {
  if (!process.env.HUBSPOT_API_KEY) return
  const { data: convo } = await supabase.from('chat_conversations').select('*').eq('id', conversationId).maybeSingle()
  if (!convo || convo.handoff_provider !== 'hubspot') return
  const c = convo as ChatConversation

  const { data: msgs } = await supabase.from('chat_messages').select('*')
    .eq('conversation_id', c.id).order('created_at', { ascending: true }).limit(500)
  const body = noteBody(c, (msgs as ChatMessage[]) || [])

  if (c.crm_note_id) {
    const res = await fetch(`${BASE}/crm/v3/objects/notes/${c.crm_note_id}`, {
      method: 'PATCH', headers: headers(), cache: 'no-store',
      body: JSON.stringify({ properties: { hs_note_body: body } }),
    })
    if (res.ok || res.status !== 404) return
    // Someone deleted the note in HubSpot — fall through and make a new one.
  }

  const contactId = await contactIdFor(c)
  if (!contactId) return
  const companies = await companyIdsFor(contactId)
  if (!companies.length) return // a lead with no company: the contact timeline already has the thread

  const res = await fetch(`${BASE}/crm/v3/objects/notes`, {
    method: 'POST', headers: headers(), cache: 'no-store',
    body: JSON.stringify({
      properties: { hs_note_body: body, hs_timestamp: new Date(c.live_at || c.created_at).getTime() },
      associations: companies.map(id => ({
        to: { id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_COMPANY }],
      })),
    }),
  })
  if (!res.ok) {
    console.error('[chat-crm-log] note create failed:', res.status, (await res.text()).slice(0, 300))
    return
  }
  const noteId = (await res.json())?.id
  if (noteId) {
    await supabase.from('chat_conversations')
      .update({ crm_note_id: String(noteId), hubspot_contact_id: contactId }).eq('id', c.id)
  }
}

// One write at a time per conversation (the app runs as a single process), and
// a burst of messages collapses into one trailing rewrite.
const running = new Map<string, Promise<void>>()
const pending = new Set<string>()

export function refreshCompanyChatNote(conversationId: string): void {
  if (running.has(conversationId)) { pending.add(conversationId); return }
  const run = (async () => {
    try {
      do {
        pending.delete(conversationId)
        await writeNote(conversationId)
      } while (pending.has(conversationId))
    } catch (e) {
      console.error('[chat-crm-log]', e instanceof Error ? e.message : e)
    } finally {
      running.delete(conversationId)
    }
  })()
  running.set(conversationId, run)
}
