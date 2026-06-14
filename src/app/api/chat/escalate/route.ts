import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { escalateLead } from '@/lib/escalate'

export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/escalate — "Talk to a real person". Fires an instant Slack
 * alert (with email fallback) so the team can reach the visitor. Deduped to
 * one alert per session in escalateLead(). Called by the chat widget's
 * "Talk to a human" button and by server-side intent detection in /api/chat.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const result = await escalateLead({
    sessionId: (body.sessionId as string) || null,
    messages: Array.isArray(body.messages) ? (body.messages as { role: string; content: string }[]) : [],
    name: (body.name as string) || null,
    email: (body.email as string) || null,
    phone: (body.phone as string) || null,
    dealership: (body.dealership as string) || null,
    page: (body.page as string) || req.headers.get('referer') || null,
    utm: (body.utm as Record<string, string | null>) || null,
    trigger: 'button',
  })

  // 200 even on channel:'none' so the widget UX isn't broken — the failure is
  // logged loudly server-side and is a config issue, not a client error.
  return NextResponse.json(result)
}
