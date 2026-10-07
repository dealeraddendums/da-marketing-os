import { NextRequest, NextResponse } from 'next/server'
import { platformSecretOk } from '@/lib/hubspot-chat/platform-auth'
import { publishVisitorMessage, uploadToHubSpotFiles, type HsAttachment } from '@/lib/hubspot-chat/client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/**
 * POST /api/hubspot-chat/inapp/publish — da-platform's door into the bridge.
 * In-app Steven never holds HubSpot credentials; it asks this app (the single
 * HubSpot gateway) to publish a dealer's message into the Support inbox on the
 * in-app channel account. Auth: X-Webhook-Secret (MARKETING_WEBHOOK_SECRET).
 *
 * Body: { threadId, idempotencyId, text, visitorName?, visitorEmail?, visitorKey,
 *         files?: [{ name, mime, base64 }] }
 * threadId is the help_conversations id — agent replies come back with it.
 */
export async function POST(req: NextRequest) {
  if (!platformSecretOk(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b.threadId !== 'string' || typeof b.idempotencyId !== 'string' || typeof b.visitorKey !== 'string') {
    return NextResponse.json({ error: 'threadId, idempotencyId, visitorKey required' }, { status: 400 })
  }

  const attachments: HsAttachment[] = []
  const errors: string[] = []
  for (const f of (Array.isArray(b.files) ? b.files : []) as { name?: string; mime?: string; base64?: string }[]) {
    if (!f?.base64 || !f.name || !f.mime) continue
    const up = await uploadToHubSpotFiles({ bytes: Buffer.from(f.base64, 'base64'), fileName: f.name, mime: f.mime })
    if (up.ok && up.fileId) attachments.push({ type: 'FILE', fileId: up.fileId, fileUsageType: f.mime.startsWith('image/') ? 'IMAGE' : 'OTHER' })
    else errors.push(`file ${f.name}: ${up.error}`)
  }

  const r = await publishVisitorMessage({
    surface: 'inapp',
    threadId: b.threadId,
    idempotencyId: b.idempotencyId,
    text: typeof b.text === 'string' ? b.text : '',
    visitorName: typeof b.visitorName === 'string' ? b.visitorName : null,
    visitorEmail: typeof b.visitorEmail === 'string' ? b.visitorEmail : null,
    visitorKey: b.visitorKey,
    attachments,
  })
  if (!r.ok) console.error('[inapp/publish]', r.error)
  return NextResponse.json({ ...r, fileErrors: errors.length ? errors : undefined }, { status: r.ok ? 200 : 502 })
}
