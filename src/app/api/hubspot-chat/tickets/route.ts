import { NextRequest, NextResponse } from 'next/server'
import { platformSecretOk } from '@/lib/hubspot-chat/platform-auth'
import { createTicket, ticketStatuses, contactCompanyIds } from '@/lib/hubspot-chat/tickets'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/**
 * POST /api/hubspot-chat/tickets — ticket operations for da-platform
 * (X-Webhook-Secret). The bridge app holds the `tickets` scope; da-platform's
 * own private-app token does not.
 *   { action: 'create', subject, content, contactId?, companyIds? }
 *       companyIds omitted → the contact's companies are used
 *   { action: 'status', ids: [...] }   current stage of each ticket
 */
export async function POST(req: NextRequest) {
  if (!platformSecretOk(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const b = await req.json().catch(() => ({})) as Record<string, unknown>

  if (b.action === 'create') {
    if (typeof b.subject !== 'string' || typeof b.content !== 'string') {
      return NextResponse.json({ error: 'subject and content required' }, { status: 400 })
    }
    const contactId = typeof b.contactId === 'string' && b.contactId ? b.contactId : null
    let companyIds = Array.isArray(b.companyIds) ? (b.companyIds as unknown[]).map(String).filter(Boolean) : []
    if (!companyIds.length && contactId) companyIds = await contactCompanyIds(contactId)
    const r = await createTicket({ subject: b.subject, content: b.content, contactId, companyIds })
    if (!r.ok) console.error('[hubspot-chat/tickets] create failed:', r.error)
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  }

  if (b.action === 'status') {
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String) : []
    try {
      return NextResponse.json({ ok: true, tickets: await ticketStatuses(ids) })
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
