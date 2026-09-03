// POST /api/leads/resend-confirmation
//
// Re-sends the Layer 0 confirmation email for a signup still awaiting
// confirmation. POST-only, like /api/leads/confirm — a GET here would let an
// email scanner or a crawler trigger mail on someone's behalf.
//
// This endpoint is intentionally boring: it always answers with the same
// message. Unknown address, already provisioned, inside the cooldown, or a fresh
// email genuinely sent all look identical from outside, so it cannot be used to
// discover which addresses have a pending signup.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { resendConfirmation, RESEND_GENERIC_MESSAGE } from '@/lib/lead-confirm'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // Coarse per-IP gate in front of the per-lead DB cooldown. Cheap defence
  // against someone spraying addresses to fish for a timing difference.
  if (!rateLimit(`resend:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { error: 'Too many requests — please wait a few minutes and try again.' },
      { status: 429 },
    )
  }

  const body = (await req.json().catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim()

  // Shape validation only. An invalid address is a client mistake worth telling
  // them about; whether a VALID address exists in our data is never revealed.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const outcome = await resendConfirmation(email)
  console.log(`[resend-confirmation] outcome=${outcome} ip=${ip}`)

  // Same body, same status, every time.
  return NextResponse.json({ ok: true, message: RESEND_GENERIC_MESSAGE })
}
