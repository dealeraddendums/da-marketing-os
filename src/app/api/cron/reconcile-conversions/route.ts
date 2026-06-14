import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/reconcile-conversions
 *
 * Safety net + initial backfill for the trial→paid join. Pulls every lead that
 * has a da_dealer_id/da_group_id and isn't yet 'converted', asks DA Platform's
 * batch endpoint whether each is paid, and stamps the converted ones (same
 * idempotent / no-backward rule as the webhook). Catches any missed webhook
 * and, on first run, backfills leads that already converted.
 *
 * Auth: x-api-key === DA_CRON_KEY (mirrors cron/sync-reviews). EasyCron daily,
 * after DA Platform's 08:00 UTC sync. Read-only w.r.t. billing.
 */
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.DA_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = process.env.DA_PLATFORM_URL
  const key = process.env.SELF_SERVE_API_KEY
  if (!base || !key) {
    return NextResponse.json({ error: 'DA_PLATFORM_URL / SELF_SERVE_API_KEY not configured' }, { status: 503 })
  }

  // Candidate leads: have a join key, not already converted.
  const { data: leads, error } = await supabase
    .from('marketing_leads')
    .select('id, da_dealer_id, da_group_id, status')
    .or('da_dealer_id.not.is.null,da_group_id.not.is.null')
    .neq('status', 'converted')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const candidates = leads ?? []
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, converted: 0 })
  }

  const dealerIds = Array.from(new Set(candidates.map(l => l.da_dealer_id).filter(Boolean)))
  const groupIds = Array.from(new Set(candidates.map(l => l.da_group_id).filter(Boolean)))

  let statuses: Record<string, { paid: boolean; convertedAt: string | null; plan?: string; mrr?: number }>
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/stats/conversion-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      body: JSON.stringify({ dealerIds, groupIds }),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `conversion-status HTTP ${res.status}` }, { status: 502 })
    }
    statuses = await res.json()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'conversion-status call failed' }, { status: 502 })
  }

  let converted = 0
  const errors: string[] = []
  for (const lead of candidates) {
    const st = (lead.da_dealer_id && statuses[lead.da_dealer_id]) || (lead.da_group_id && statuses[lead.da_group_id])
    if (!st || !st.paid) continue
    const { error: upErr } = await supabase
      .from('marketing_leads')
      .update({
        status: 'converted',
        converted_at: st.convertedAt || new Date().toISOString(),
        plan: st.plan ?? null,
        mrr: typeof st.mrr === 'number' ? st.mrr : null,
      })
      .eq('id', lead.id)
      .neq('status', 'converted') // idempotent guard against a concurrent webhook
    if (upErr) errors.push(`${lead.id}: ${upErr.message}`)
    else converted++
  }

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    dealerIds: dealerIds.length,
    groupIds: groupIds.length,
    converted,
    errors: errors.length ? errors : undefined,
    ranAt: new Date().toISOString(),
  })
}
