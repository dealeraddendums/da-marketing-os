// POST /api/leads/code-verified — DA Platform → marketing, server-to-server.
//
// One-email trial flow: fired by the platform's /api/self-serve/verify-code the
// moment an applicant proves email ownership by entering their setup code —
// either provisioning (gate-approved) or confirming a held signup
// (pending_review). This is the new home of the moment the old /confirm click
// marked: the lead is stamped confirmed and the GA4 trial_signup conversion
// fires HERE, never at form submit, so unconfirmed (bot) submissions can never
// count as conversions.
//
// AUTH: X-Webhook-Secret === MARKETING_WEBHOOK_SECRET (the same pair as
// /api/conversions and /api/leads/pending-confirmation).
//
// Idempotent: a lead already confirmed (webhook retry, or the legacy /confirm
// shim already fired the conversion) is stamped-only — the conversion is never
// sent twice.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fireTrialSignupForLead, type LeadRow } from '@/lib/lead-confirm'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.MARKETING_WEBHOOK_SECRET || secret !== process.env.MARKETING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string
    leadId?: string | null
    status?: 'provisioned' | 'pending_review'
    dealer_id?: string | null
    group_id?: string | null
  } | null
  const email = body?.email?.trim().toLowerCase()
  const status = body?.status
  if (!email || (status !== 'provisioned' && status !== 'pending_review')) {
    return NextResponse.json({ error: 'email and status (provisioned|pending_review) required' }, { status: 400 })
  }

  // Find the lead: by id when the platform carried one, else newest for the
  // email (the same resolution resendConfirmation uses).
  let lead: LeadRow | null = null
  if (body?.leadId) {
    const { data } = await supabase.from('marketing_leads').select('*').eq('id', body.leadId).maybeSingle<LeadRow>()
    lead = data ?? null
  }
  if (!lead) {
    const { data } = await supabase
      .from('marketing_leads').select('*')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
    lead = (data?.[0] as LeadRow | undefined) ?? null
  }
  if (!lead) return NextResponse.json({ ok: true, lead: 'not_found' })

  const alreadyConfirmed = !!lead.confirmed_at

  const { error: updErr } = await supabase
    .from('marketing_leads')
    .update({
      confirmed_at: lead.confirmed_at ?? new Date().toISOString(),
      provision_status: status,
      ...(body?.dealer_id ? { da_dealer_id: body.dealer_id } : {}),
      ...(body?.group_id ? { da_group_id: body.group_id } : {}),
    })
    .eq('id', lead.id)
  if (updErr) console.error('[code-verified] lead stamp failed:', updErr.message)

  // The conversion — only on the FIRST proof of ownership.
  if (!alreadyConfirmed) {
    try {
      await fireTrialSignupForLead(lead, { status, dealer_id: body?.dealer_id ?? null, group_id: body?.group_id ?? null })
    } catch (err) {
      console.error('[code-verified] trial_signup send failed:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ ok: true, lead: lead.id, conversionSent: !alreadyConfirmed })
}
