import { NextRequest, NextResponse } from 'next/server'
import { verifyCardRequest, makeHomepageTicket } from '@/lib/hubspot-chat/card'
import { postToPlatform } from '@/lib/hubspot-chat/platform-auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/**
 * POST { surface: 'homepage'|'inapp', conversationId, contactId } (HubSpot-
 * signed) — the agent pressed "Make this a ticket" on ONE chat. Website chats
 * are ticketed here; in-app chats by da-platform (which owns their transcript).
 * Both are idempotent: a second press returns the existing ticket.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const caller = verifyCardRequest(req, raw)
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = JSON.parse(raw || '{}') as { surface?: string; conversationId?: string; contactId?: string | number }
  if (!b.conversationId || (b.surface !== 'homepage' && b.surface !== 'inapp')) {
    return NextResponse.json({ error: 'surface and conversationId required' }, { status: 400 })
  }
  const requestedBy = caller.userEmail || 'a HubSpot user'

  if (b.surface === 'homepage') {
    const r = await makeHomepageTicket(b.conversationId, requestedBy, b.contactId != null ? String(b.contactId) : null)
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  }
  const r = await postToPlatform('/api/help/make-ticket', { conversationId: b.conversationId, requestedBy }, 30_000)
  return NextResponse.json(r.data ?? { ok: false, error: `platform HTTP ${r.status}` }, { status: r.ok ? 200 : 502 })
}
