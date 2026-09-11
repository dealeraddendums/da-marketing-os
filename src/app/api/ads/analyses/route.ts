import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { isMissingTable, MIGRATION_HINT } from '@/lib/ads-analyst/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ads/analyses?customerId=…            → latest run + light history
 * GET /api/ads/analyses?id=…                    → one run's full brief
 *
 * The snapshot is deliberately never returned: it is tens of thousands of
 * tokens and the UI has no use for it. It stays in the row for auditability.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const customerId = searchParams.get('customerId')

  if (id) {
    const { data, error } = await supabase
      .from('ads_analyses')
      .select('id, created_at, customer_id, customer_name, date_range, brief, raw_response, model, status, error, proposal_count')
      .eq('id', id).maybeSingle()
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ analysis: null, migrationPending: true, detail: MIGRATION_HINT })
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    return NextResponse.json({ analysis: data ?? null })
  }

  let q = supabase
    .from('ads_analyses')
    .select('id, created_at, customer_id, customer_name, date_range, brief, raw_response, model, status, error, proposal_count')
    .order('created_at', { ascending: false })
    .limit(20)
  if (customerId) q = q.eq('customer_id', customerId)

  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ latest: null, history: [], migrationPending: true, detail: MIGRATION_HINT })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  const rows = data ?? []
  return NextResponse.json({
    latest: rows[0] ?? null,
    // History entries carry no brief — the list only needs to be pickable.
    history: rows.slice(1).map(r => ({
      id: r.id, createdAt: r.created_at, customerId: r.customer_id,
      customerName: r.customer_name, model: r.model, status: r.status,
      proposalCount: r.proposal_count, dateRange: r.date_range,
    })),
  })
}
