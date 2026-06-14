import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/conversions — DA Platform tells us a provisioned dealer/group
 * started paying. Secret-verified, idempotent, no-backward.
 *
 * Body: { dealerId?, groupId?, convertedAt, plan?, mrr? }
 *   - dealerId matches marketing_leads.da_dealer_id (ss_* text id)
 *   - groupId  matches marketing_leads.da_group_id (group UUID)
 * Only stamps a lead that isn't already 'converted'. Unknown id → 200 no-op
 * (the dealer may predate provisioning attribution).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.MARKETING_WEBHOOK_SECRET || secret !== process.env.MARKETING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dealerId?: string; groupId?: string; convertedAt?: string; plan?: string; mrr?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const { dealerId, groupId, convertedAt, plan, mrr } = body
  if (!dealerId && !groupId) {
    return NextResponse.json({ error: 'dealerId or groupId required' }, { status: 400 })
  }

  // Match the lead on whichever id we were given.
  let q = supabase.from('marketing_leads').select('id, status').limit(1)
  q = dealerId ? q.eq('da_dealer_id', dealerId) : q.eq('da_group_id', groupId!)
  const { data: leads, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const lead = leads?.[0]
  if (!lead) {
    return NextResponse.json({ ok: true, matched: false }) // unknown id → no-op
  }
  if (lead.status === 'converted') {
    return NextResponse.json({ ok: true, matched: true, alreadyConverted: true }) // no-backward
  }

  const { error: upErr } = await supabase
    .from('marketing_leads')
    .update({
      status: 'converted',
      converted_at: convertedAt || new Date().toISOString(),
      plan: plan ?? null,
      mrr: typeof mrr === 'number' ? mrr : null,
    })
    .eq('id', lead.id)
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, matched: true, converted: true })
}
