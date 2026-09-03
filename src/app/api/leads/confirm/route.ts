// POST-only email-confirmation endpoint (Layer 0).
//
// POST, not GET, so an email link scanner prefetching the confirmation URL
// cannot provision an account on the applicant's behalf. The emailed link opens
// /confirm/[token], and that page's button posts here.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { confirmAndProvision } from '@/lib/lead-confirm'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(`confirm:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many attempts — please try again shortly.' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) as { token?: string } | null
  const token = body?.token?.trim()
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 })

  const result = await confirmAndProvision(token)
  if (!result.ok) {
    return NextResponse.json(
      { error: 'This confirmation link is no longer valid. It may already have been used — try signing in, or contact support@dealeraddendums.com.' },
      { status: 410 },
    )
  }

  const { outcome } = result
  switch (outcome.status) {
    case 'provisioned':
      return NextResponse.json({ ok: true, status: 'provisioned', message: "You're all set — check your inbox for your account setup email." })
    case 'existing':
      return NextResponse.json({ ok: true, status: 'existing', message: 'You already have an account — head to app.dealeraddendums.com to sign in.' })
    case 'pending_review':
      return NextResponse.json({ ok: true, status: 'pending_review', message: outcome.message ?? "Thanks — we're reviewing your details and will activate your account shortly." })
    case 'after_hours':
      return NextResponse.json({ ok: true, status: 'after_hours', message: outcome.message ?? 'Sign-ups are open 5 AM–9 PM Pacific — please try again during business hours.' })
    case 'rejected':
      return NextResponse.json({ ok: true, status: 'rejected', message: outcome.message ?? "We couldn't complete this signup. Please contact support@dealeraddendums.com." })
    default:
      return NextResponse.json({ ok: true, status: 'failed', message: "Your email is confirmed, but we hit a snag creating the account. Our team has been notified — or email support@dealeraddendums.com." })
  }
}
