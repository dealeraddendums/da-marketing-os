// Layer 0 visibility for DA Platform's admin UI.
//
// A lead that submitted the trial form but never clicked the confirmation link
// never provisions — nothing is created, and nobody finds out unless someone
// thinks to look. Those rows live HERE (marketing_leads, the da-marketing-os
// Supabase project), not in DA Platform, so DA Platform's admin topbar badge
// and its /admin/trial-signups page read them through this endpoint.
//
// GET  → count + rows awaiting confirmation past the stuck threshold
// POST → resend the confirmation email for one of them
//
// AUTH: X-Webhook-Secret === MARKETING_WEBHOOK_SECRET, the secret DA Platform
// already shares with this app (same pattern as /api/conversions). Server-to-
// server only; never reachable from a browser. Unlike the PUBLIC
// /api/leads/resend-confirmation — which is deliberately non-enumerable and
// answers identically for every outcome — this one reports the real outcome,
// because the caller is already authenticated staff who need to know whether
// the mail actually went.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { resendConfirmation } from '@/lib/lead-confirm'

export const dynamic = 'force-dynamic'

/**
 * How old an unconfirmed signup must be before it counts as "stuck".
 *
 * There is NO expiry on a confirmation token — confirmAndProvision() only
 * requires the token to exist, so a link mailed weeks ago still works. That
 * means "stuck" can't be derived from a TTL; it's purely "this person has had
 * long enough that someone should follow up". Two hours: comfortably past the
 * 10-minute resend cooldown and past a normal check-your-email delay, while
 * still surfacing a same-morning signup before the day is out.
 */
const STUCK_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * THE PENDING PREDICATE (inlined in both handlers below):
 *   provision_status = 'awaiting_confirmation' AND confirmed_at IS NULL
 *   AND confirm_token IS NOT NULL
 * `awaiting_confirmation` is what POST /api/leads stamps when it saves the lead
 * and sends the email.
 *
 * ⚠️ Do NOT widen this to "confirmed_at IS NULL AND provision_status IS NULL".
 * 97 of 111 leads match that, because every lead captured BEFORE Layer 0
 * shipped (2026-09-03) has no status and no token — they were never in the
 * confirmation flow at all. Counting them would pin a permanent, meaningless
 * "97 need attention" badge in the admin topbar, which is worse than no badge.
 */

/** Our own staff addresses — internal test signups, not prospects waiting on us. */
const INTERNAL_EMAIL = '%@dealeraddendums.com'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.MARKETING_WEBHOOK_SECRET || secret !== process.env.MARKETING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString()

  // Exact HEAD count — no row payload, and immune to the 1000-row read clamp.
  const { count, error: countErr } = await supabase
    .from('marketing_leads')
    .select('id', { count: 'exact', head: true })
    .eq('provision_status', 'awaiting_confirmation')
    .is('confirmed_at', null)
    .not('confirm_token', 'is', null)
    .lt('created_at', cutoff)
    .not('email', 'ilike', INTERNAL_EMAIL)

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 })
  }

  // Rows for the admin list. Capped: this is a follow-up queue, not an export,
  // and a queue long enough to need paging is itself the thing to fix.
  const { data, error } = await supabase
    .from('marketing_leads')
    .select('id, created_at, name, email, dealership, zip, confirm_sent_at')
    .eq('provision_status', 'awaiting_confirmation')
    .is('confirmed_at', null)
    .not('confirm_token', 'is', null)
    .lt('created_at', cutoff)
    .not('email', 'ilike', INTERNAL_EMAIL)
    .order('created_at', { ascending: true })   // oldest first — longest waiting
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    count: count ?? 0,
    stuckAfterHours: STUCK_AFTER_MS / 3_600_000,
    leads: (data ?? []).map(l => ({
      ...l,
      hoursWaiting: Math.floor((Date.now() - new Date(l.created_at).getTime()) / 3_600_000),
    })),
  })
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.MARKETING_WEBHOOK_SECRET || secret !== process.env.MARKETING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { email?: string } | null
  const email = body?.email?.trim()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  // Reuses the existing resend path verbatim: fresh token if the lead lost one,
  // a new confirm_sent_at, and the same 10-minute DB-backed cooldown. It does
  // NOT confirm on the lead's behalf — that would defeat Layer 0 entirely.
  const outcome = await resendConfirmation(email)
  console.log(`[pending-confirmation] resend outcome=${outcome} (staff-initiated)`)

  const message: Record<string, string> = {
    sent: 'Confirmation email re-sent.',
    throttled: 'Already re-sent within the last 10 minutes — try again shortly.',
    not_pending: 'That signup is no longer awaiting confirmation.',
    unknown: 'No signup found for that address.',
    error: 'The resend failed — check the marketing logs.',
  }
  return NextResponse.json(
    { ok: outcome === 'sent', outcome, message: message[outcome] ?? outcome },
    { status: outcome === 'error' ? 500 : 200 },
  )
}
