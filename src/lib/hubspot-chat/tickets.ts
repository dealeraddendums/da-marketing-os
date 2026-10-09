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

/**
 * The ONE pipeline dealer-support tickets live in: "Customer Support"
 * (28040372). Not HubSpot's id-"0" default — on this portal that one is
 * "Account Onboarding Support" (onboarding + "Check FreshBooks" ops tickets),
 * which is where every Steven ticket used to land, out of sight of the support
 * board and of the dealer's "My support tickets". Override with
 * HUBSPOT_SUPPORT_PIPELINE_ID; if the id is gone, match the label.
 */
export const SUPPORT_PIPELINE_ID = process.env.HUBSPOT_SUPPORT_PIPELINE_ID || '28040372'
const SUPPORT_PIPELINE_LABEL = 'Customer Support'
/** HubSpot's own default pipeline id — where tickets land when nobody picked one. */
const PORTAL_DEFAULT_PIPELINE_ID = '0'

async function supportPipeline(): Promise<Pipeline> {
  const pipelines = await ticketPipelines()
  const p = pipelines.find(x => x.id === SUPPORT_PIPELINE_ID)
    || pipelines.find(x => x.label.trim().toLowerCase() === SUPPORT_PIPELINE_LABEL.toLowerCase())
  if (!p) throw new Error(`support ticket pipeline ${SUPPORT_PIPELINE_ID} / "${SUPPORT_PIPELINE_LABEL}" not found`)
  return p
}

/** The support pipeline and its first OPEN stage ("New"). */
async function supportPipelineAndStage(): Promise<{ pipeline: string; stage: string }> {
  const p = await supportPipeline()
  const open = [...p.stages].sort((a, b) => ((a as { displayOrder?: number }).displayOrder ?? 0) - ((b as { displayOrder?: number }).displayOrder ?? 0))
    .filter(s => s.metadata?.isClosed !== 'true')
  const stage = open.find(s => s.label.trim().toLowerCase() === 'new') || open[0] || p.stages[0]
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
    const { pipeline, stage } = await supportPipelineAndStage()
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
  pipeline: string | null
  support: boolean        // in the dealer-support pipeline (the only one dealers may see)
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
  const supportId = (await supportPipeline().catch(() => null))?.id ?? SUPPORT_PIPELINE_ID
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
      pipeline: t.properties.hs_pipeline,
      support: !!p && p.id === supportId,
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

/** Link an existing ticket to a company (idempotent — HubSpot PUT). Used when
 *  a ticket an agent made in the inbox is adopted: those link the contact only. */
export async function linkTicketToCompany(ticketId: string, companyId: string): Promise<boolean> {
  const r = await hsFetch(
    `/crm/v4/objects/tickets/${encodeURIComponent(ticketId)}/associations/default/companies/${encodeURIComponent(companyId)}`,
    { method: 'PUT' },
  )
  return r.ok
}

/**
 * Dealer-support tickets linked to a company — the dealer's "My support
 * tickets", independent of HOW the ticket was made (Steven, the inbox, the
 * CRM screen, an email). Support pipeline only: the other pipelines on this
 * portal hold internal / onboarding / billing-ops tickets a dealer must not see.
 */
export async function supportTicketIdsForCompany(companyId: string): Promise<string[]> {
  if (!/^\d+$/.test(companyId)) return []
  const p = await supportPipeline()
  const r = await hsFetch('/crm/v3/objects/tickets/search', {
    method: 'POST',
    json: {
      filterGroups: [{ filters: [
        { propertyName: 'associations.company', operator: 'EQ', value: companyId },
        { propertyName: 'hs_pipeline', operator: 'EQ', value: p.id },
      ] }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: ['hs_pipeline'],
      limit: 50,
    },
  })
  if (!r.ok) throw new Error(`ticket search HTTP ${r.status}`)
  return (((r.data as { results?: { id: string }[] })?.results) || []).map(x => String(x.id))
}

/**
 * An inbox "Create ticket" lands in the INBOX's default pipeline. When that's
 * the portal default (nobody chose one), move the ticket to the support
 * pipeline's matching first stage so it shows on the support board and to the
 * dealer. A ticket an agent deliberately put in another pipeline (e.g.
 * Internal) or has already worked (stage moved) is left alone.
 */
export async function moveDefaultPipelineTicketToSupport(ticketId: string): Promise<boolean> {
  if (!/^\d+$/.test(ticketId)) return false
  const r = await hsFetch('/crm/v3/objects/tickets/batch/read', {
    method: 'POST',
    json: { properties: ['hs_pipeline', 'hs_pipeline_stage'], inputs: [{ id: ticketId }] },
  })
  const t = ((r.data as { results?: { properties: Record<string, string | null> }[] })?.results || [])[0]
  if (!r.ok || !t || t.properties.hs_pipeline !== PORTAL_DEFAULT_PIPELINE_ID) return false
  const def = (await ticketPipelines()).find(x => x.id === PORTAL_DEFAULT_PIPELINE_ID)
  const firstOpen = def && [...def.stages].sort((a, b) => ((a as { displayOrder?: number }).displayOrder ?? 0) - ((b as { displayOrder?: number }).displayOrder ?? 0))
    .find(s => s.metadata?.isClosed !== 'true')
  if (!firstOpen || t.properties.hs_pipeline_stage !== firstOpen.id) return false
  const { pipeline, stage } = await supportPipelineAndStage()
  const u = await hsFetch(`/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH', json: { properties: { hs_pipeline: pipeline, hs_pipeline_stage: stage } },
  })
  return u.ok
}

/**
 * The agent-written progress notes on a ticket that a DEALER may see (their
 * "My support tickets" view, 2026-10-09). HubSpot notes are internal by
 * nature, so this is an allowlist — every rule must pass or the note is hidden:
 *
 *  1. Written by a person in HubSpot (hs_object_source CRM_UI / mobile app).
 *     Our own integration notes ("DA Help conversation …", chat transcripts)
 *     come in as INTEGRATION and are plumbing, not updates.
 *  2. Created after the ticket was. HubSpot copies the company's EARLIER notes
 *     onto a new ticket (seen: a 9/30 "Had to manually add billing contact"
 *     note on a ticket made 10/8) — those are internal history.
 *  3. No internal marker: a note containing `[internal]` or `#internal`
 *     anywhere is never shown. This is the agents' escape hatch.
 *  4. Not one of our known system formats (belt and braces for rule 1).
 *
 * Bodies come back as PLAIN TEXT (HTML stripped) so nothing an agent pastes
 * can render as markup in the dealer's browser. Author is not returned.
 */
export const INTERNAL_NOTE_MARKER = /[[#]\s*internal\b\]?/i
const HUMAN_NOTE_SOURCES = new Set(['CRM_UI', 'MOBILE_IOS', 'MOBILE_ANDROID'])
const SYSTEM_NOTE_PREFIXES = [/^DA Help conversation\b/i, /^Live chat \(website/i]

export function noteHtmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export interface DealerVisibleNote { id: string; at: string; text: string }

export async function dealerVisibleTicketNotes(ticketId: string): Promise<DealerVisibleNote[]> {
  if (!/^\d+$/.test(ticketId)) return []
  const t = await hsFetch(`/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}?properties=createdate,hs_pipeline`)
  if (!t.ok) throw new Error(`ticket read HTTP ${t.status}`)
  const tp = (t.data as { properties?: Record<string, string | null> }).properties || {}
  // Dealer-facing only for the support pipeline (the platform scopes the
  // ticket to the dealer too; this is the second lock).
  if (tp.hs_pipeline !== (await supportPipeline()).id) return []
  const ticketCreated = Date.parse(tp.createdate || '')
  if (!Number.isFinite(ticketCreated)) return []

  const a = await hsFetch(`/crm/v4/objects/tickets/${encodeURIComponent(ticketId)}/associations/notes?limit=100`)
  if (!a.ok) throw new Error(`ticket notes HTTP ${a.status}`)
  const ids = (((a.data as { results?: { toObjectId: number | string }[] })?.results) || []).map(x => ({ id: String(x.toObjectId) }))
  if (!ids.length) return []
  const n = await hsFetch('/crm/v3/objects/notes/batch/read', {
    method: 'POST',
    json: { properties: ['hs_note_body', 'hs_createdate', 'hs_object_source', 'hs_created_by'], inputs: ids.slice(0, 100) },
  })
  if (!n.ok) throw new Error(`notes read HTTP ${n.status}`)
  const rows = ((n.data as { results?: { id: string; properties: Record<string, string | null> }[] })?.results) || []
  return filterDealerVisibleNotes(rows, ticketCreated)
}

/** The allowlist above, as a pure function (unit-testable without HubSpot). */
export function filterDealerVisibleNotes(
  rows: { id: string; properties: Record<string, string | null> }[],
  ticketCreatedMs: number,
): DealerVisibleNote[] {
  const out: DealerVisibleNote[] = []
  for (const r of rows) {
    const p = r.properties
    if (!HUMAN_NOTE_SOURCES.has(String(p.hs_object_source || ''))) continue
    if (!p.hs_created_by) continue
    const created = Date.parse(p.hs_createdate || '')
    if (!Number.isFinite(created) || created < ticketCreatedMs) continue
    const raw = p.hs_note_body || ''
    if (INTERNAL_NOTE_MARKER.test(raw)) continue
    const text = noteHtmlToText(raw)
    if (!text || INTERNAL_NOTE_MARKER.test(text) || SYSTEM_NOTE_PREFIXES.some(re => re.test(text))) continue
    out.push({ id: r.id, at: new Date(created).toISOString(), text: text.slice(0, 4000) })
  }
  return out.sort((x, y) => x.at.localeCompare(y.at))
}
