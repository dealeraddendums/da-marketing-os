import { NextRequest, NextResponse } from 'next/server'
import { verifyCardRequest, contactEmail, homepageChatsFor, type CardChat } from '@/lib/hubspot-chat/card'
import { postToPlatform } from '@/lib/hubspot-chat/platform-auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/** POST { contactId } (HubSpot-signed, from the contact card) — this contact's
 *  recent Steven chats from the website AND the DA Platform, newest first. */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verifyCardRequest(req, raw)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = JSON.parse(raw || '{}') as { contactId?: string | number }
  const contactId = body.contactId != null ? String(body.contactId) : ''
  if (!/^\d+$/.test(contactId)) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const email = await contactEmail(contactId)
  const [web, app] = await Promise.all([
    homepageChatsFor(contactId, email),
    postToPlatform('/api/help/card-chats', { contactId, email }),
  ])
  const inapp = (app.ok ? ((app.data as { chats?: CardChat[] })?.chats || []) : []) as CardChat[]
  const chats = [...web, ...inapp].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 12)
  return NextResponse.json({ chats, platformError: app.ok ? undefined : 'DA Platform chats unavailable' })
}
