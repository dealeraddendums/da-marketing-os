// Tickets through the CRM Tickets API — the ONLY way to make a ticket on this
// account: inbox conversations can't be turned into tickets in the UI here
// (portal created after April 2024; no "Create ticket", no "+ Add" on the
// contact's Tickets card — verified by Allan 2026-10-07).
//
// Creation is never automatic: callers run this only when a person chose
// "Make this a ticket" for one specific chat.

import { hsFetch } from './client'

const TICKET_TO_CONTACT = 16
const TICKET_TO_COMPANY = 26

interface Stage { id: string; label: string; metadata?: { ticketState?: string; isClosed?: string } }
interface Pipeline { id: string; label: string; displayOrder: number; stages: Stage[] }

let pipelinesCache: { at: number; pipelines: Pipeline[] } | null = null
async function ticketPipelines(): Promise<Pipeline[]> {
  if (pipelinesCache && Date.now() - pipelinesCache.at < 10 * 60_000) return pipelinesCache.pipelines
  const r = await hsFetch('/crm/v3/pipelines/tickets')
  if (!r.ok) throw new Error(`ticket pipelines HTTP ${r.status}`)
  const pipelines = (((r.data as { results?: Pipeline[] })?.results) || [])
    .sort((a, b) => a.displayOrder - b.displayOrder)
  pipelinesCache = { at: Date.now(), pipelines }
  return pipelines
}

/** The support pipeline (HubSpot's default "Support Pipeline", id "0", else the
 *  first) and its first OPEN stage ("New"). */
async function defaultPipelineAndStage(): Promise<{ pipeline: string; stage: string }> {
  const pipelines = await ticketPipelines()
  const p = pipelines.find(x => x.id === '0') || pipelines[0]
  if (!p) throw new Error('no ticket pipeline in the account')
  const stage = p.stages.find(s => s.metadata?.isClosed !== 'true') || p.stages[0]
  return { pipeline: p.id, stage: stage.id }
}

export async function createTicket(opts: {
  subject: string
  content: string
  contactId?: string | null
  companyIds?: string[]
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
}): Promise<{ ok: boolean; ticketId?: string; error?: string }> {
  try {
    const { pipeline, stage } = await defaultPipelineAndStage()
    const associations = [
      ...(opts.contactId ? [{ to: { id: opts.contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: TICKET_TO_CONTACT }] }] : []),
      ...(opts.companyIds || []).map(id => ({ to: { id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: TICKET_TO_COMPANY }] })),
    ]
    const r = await hsFetch('/crm/v3/objects/tickets', {
      method: 'POST',
      json: {
        properties: {
          subject: opts.subject.slice(0, 250),
          content: opts.content.slice(0, 60000),
          hs_pipeline: pipeline,
          hs_pipeline_stage: stage,
          hs_ticket_priority: opts.priority || 'MEDIUM',
          source_type: 'CHAT',
        },
        associations,
      },
    })
    if (!r.ok) return { ok: false, error: `create ticket HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}` }
    return { ok: true, ticketId: String((r.data as { id?: string }).id) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface TicketStatus {
  id: string
  subject: string | null
  status: string          // the stage label, e.g. "New", "Waiting on us", "Closed"
  state: 'open' | 'waiting' | 'closed'
  updatedAt: string | null
  createdAt: string | null
}

/** Current status of specific tickets (batch read + stage labels). */
export async function ticketStatuses(ids: string[]): Promise<TicketStatus[]> {
  const unique = ids.filter((v, i) => v && ids.indexOf(v) === i).slice(0, 100)
  if (!unique.length) return []
  const r = await hsFetch('/crm/v3/objects/tickets/batch/read', {
    method: 'POST',
    json: {
      properties: ['subject', 'hs_pipeline', 'hs_pipeline_stage', 'hs_lastmodifieddate', 'createdate'],
      inputs: unique.map(id => ({ id })),
    },
  })
  if (!r.ok) throw new Error(`ticket batch read HTTP ${r.status}`)
  const pipelines = await ticketPipelines()
  const rows = ((r.data as { results?: { id: string; properties: Record<string, string | null> }[] })?.results) || []
  return rows.map(t => {
    const p = pipelines.find(x => x.id === t.properties.hs_pipeline)
    const s = p?.stages.find(x => x.id === t.properties.hs_pipeline_stage)
    const closed = s?.metadata?.isClosed === 'true'
    // HubSpot's stage metadata carries a ticketState of OPEN / CLOSED only, so
    // "waiting" comes from the stage's own wording ("Waiting on contact").
    const waiting = !closed && /wait/i.test(s?.label || '')
    return {
      id: t.id,
      subject: t.properties.subject,
      status: s?.label || 'Open',
      state: closed ? 'closed' : waiting ? 'waiting' : 'open',
      updatedAt: t.properties.hs_lastmodifieddate,
      createdAt: t.properties.createdate,
    }
  })
}

/** The companies a contact belongs to (for associating a new ticket). */
export async function contactCompanyIds(contactId: string): Promise<string[]> {
  const r = await hsFetch(`/crm/v4/objects/contacts/${encodeURIComponent(contactId)}/associations/companies`)
  if (!r.ok) return []
  return (((r.data as { results?: { toObjectId: number | string }[] })?.results) || []).map(x => String(x.toObjectId))
}

/**
 * Tickets an agent made from inside the inbox ("Create ticket" on the
 * conversation) — HubSpot links them to the conversation THREAD. Returns
 * threadId → ticketId for the threads that have one, so a ticket made there
 * shows in the dealer's "My support tickets" too, not only tickets made
 * through our "Make this a ticket" flow.
 */
export async function ticketsForThreads(threadIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const ids = threadIds.filter((v, i) => /^\d+$/.test(v) && threadIds.indexOf(v) === i).slice(0, 25)
  await Promise.all(ids.map(async (id) => {
    const r = await hsFetch(`/conversations/v3/conversations/threads/${id}?association=TICKET`)
    const t = (r.data as { threadAssociations?: { associatedTicketId?: string | number } } | null)?.threadAssociations?.associatedTicketId
    if (r.ok && t != null) out[id] = String(t)
  }))
  return out
}

/** Which contacts / companies a ticket is linked to (for verification + display). */
export async function ticketAssociations(ticketId: string): Promise<{ contacts: string[]; companies: string[] }> {
  const get = async (to: string) => {
    const r = await hsFetch(`/crm/v4/objects/tickets/${encodeURIComponent(ticketId)}/associations/${to}`)
    return r.ok ? (((r.data as { results?: { toObjectId: number | string }[] })?.results) || []).map((x) => String(x.toObjectId)) : []
  }
  const [contacts, companies] = await Promise.all([get('contacts'), get('companies')])
  return { contacts, companies }
}
