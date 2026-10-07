// Backend for the "Make this a ticket" card on the HubSpot CONTACT record
// (hubspot-app/src/app/cards). The classic Conversations inbox has no slot for
// app cards, so the agent clicks through to the contact; the card lists that
// contact's recent chats from both surfaces, one button each.
//
// Card → hubspot.fetch() → here. Every request is signed by HubSpot
// (X-HubSpot-Signature-v3, app client secret) and carries portalId/userEmail in
// the query string, which the signature covers.

import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hubspotChatEnv } from './config'
import { checkSignatureV3, hsFetch } from './client'
import { createTicket, contactCompanyIds } from './tickets'
import type { ChatMessage } from '@/lib/chat-store'

export interface CardCaller { portalId: string; userEmail: string | null }

/** Verify a card request. Returns the caller, or null to reject. */
export function verifyCardRequest(req: NextRequest, rawBody: string): CardCaller | null {
  const url = new URL(req.url)
  const publicUri = `${hubspotChatEnv.siteUrl.replace(/\/$/, '')}${url.pathname}${url.search}`
  const state = checkSignatureV3({
    method: req.method,
    uri: publicUri,
    rawBody,
    signature: req.headers.get('x-hubspot-signature-v3'),
    timestamp: req.headers.get('x-hubspot-request-timestamp'),
  })
  if (state !== 'valid') {
    console.warn(`[hubspot-card] signature ${state} — rejected`)
    return null
  }
  const portalId = url.searchParams.get('portalId') || ''
  if (portalId !== hubspotChatEnv.portalId) return null
  return { portalId, userEmail: url.searchParams.get('userEmail') }
}

export async function contactEmail(contactId: string): Promise<string | null> {
  const r = await hsFetch(`/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?properties=email`)
  return r.ok ? ((r.data as { properties?: { email?: string } })?.properties?.email || null) : null
}

export interface CardChat {
  surface: 'homepage' | 'inapp'
  id: string
  startedAt: string
  preview: string
  dealership: string | null
  handedOff: boolean
  ticketId: string | null
}

/** Website chats for a contact (matched by the contact HubSpot resolved, or email). */
export async function homepageChatsFor(contactId: string, email: string | null): Promise<CardChat[]> {
  const ors = [`hubspot_contact_id.eq.${contactId}`]
  if (email) ors.push(`contact_email.ilike.${email.replace(/[%_,()]/g, '')}`)
  const { data } = await supabase.from('chat_conversations')
    .select('id, created_at, live_at, handoff_provider, hubspot_ticket_id, dealership, handoff_summary')
    .or(ors.join(',')).order('created_at', { ascending: false }).limit(10)
  const rows = (data || []) as {
    id: string; created_at: string; live_at: string | null; handoff_provider: string | null
    hubspot_ticket_id: string | null; dealership: string | null; handoff_summary: string | null
  }[]
  return rows.map(r => {
    // The summary's first visitor line is the clearest "what was this about".
    const ask = (r.handoff_summary || '').split('\n').find(l => l.startsWith('Visitor: '))?.slice(9)
    return {
      surface: 'homepage' as const,
      id: r.id,
      startedAt: r.live_at || r.created_at,
      preview: (ask || 'Website chat').replace(/\s+/g, ' ').slice(0, 140),
      dealership: r.dealership,
      handedOff: !!r.handoff_provider,
      ticketId: r.hubspot_ticket_id,
    }
  })
}

/** Ticket for a website chat — idempotent, claim-before-create like da-platform. */
export async function makeHomepageTicket(conversationId: string, requestedBy: string, contactId: string | null): Promise<{ ok: boolean; ticketId?: string; existing?: boolean; error?: string }> {
  const { data: convo } = await supabase.from('chat_conversations').select('*').eq('id', conversationId).maybeSingle()
  if (!convo) return { ok: false, error: 'conversation not found' }
  if (convo.hubspot_ticket_id) return { ok: true, ticketId: convo.hubspot_ticket_id, existing: true }

  const { data: claimed } = await supabase.from('chat_conversations')
    .update({ ticketed_at: new Date().toISOString() })
    .eq('id', conversationId).is('ticketed_at', null).is('hubspot_ticket_id', null).select('id')
  if (!claimed?.length) {
    const { data: again } = await supabase.from('chat_conversations').select('hubspot_ticket_id').eq('id', conversationId).maybeSingle()
    return again?.hubspot_ticket_id
      ? { ok: true, ticketId: again.hubspot_ticket_id, existing: true }
      : { ok: false, error: 'a ticket for this chat is already being created — refresh in a moment' }
  }

  try {
    const { data: msgs } = await supabase.from('chat_messages').select('*')
      .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500)
    const live = ((msgs || []) as ChatMessage[]).map(m => {
      const who = m.role === 'agent' ? (m.sender_name || 'Support') : m.role === 'visitor' ? 'Visitor' : 'System'
      const files = (m.attachments || []).map(a => `[file: ${a.name}]`).join(' ')
      return `${m.created_at.slice(0, 16).replace('T', ' ')}  ${who}: ${m.body}${files ? ` ${files}` : ''}`
    }).join('\n')
    const ask = (convo.handoff_summary || '').split('\n').find((l: string) => l.startsWith('Visitor: '))?.slice(9) || 'Website chat'
    const cid = contactId || convo.hubspot_contact_id || null
    const r = await createTicket({
      subject: `${convo.dealership ? `${convo.dealership}: ` : ''}${ask.replace(/\s+/g, ' ').slice(0, 120)}`,
      content: [
        `Created from a website Steven chat by ${requestedBy}.`,
        convo.handoff_summary || '',
        live ? `\n— With our team —\n${live}` : '',
      ].filter(Boolean).join('\n'),
      contactId: cid,
      companyIds: cid ? await contactCompanyIds(cid) : [],
    })
    if (!r.ok || !r.ticketId) throw new Error(r.error || 'no ticket id')
    await supabase.from('chat_conversations').update({ hubspot_ticket_id: r.ticketId }).eq('id', conversationId)
    return { ok: true, ticketId: r.ticketId }
  } catch (e) {
    await supabase.from('chat_conversations').update({ ticketed_at: null }).eq('id', conversationId).is('hubspot_ticket_id', null)
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
