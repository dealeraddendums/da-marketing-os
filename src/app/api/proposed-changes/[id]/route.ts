import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/proposed-changes/:id  { action: 'approve' | 'reject' }
 *
 * Records the decision and writes the audit trail. Approving moves the row to
 * 'approved' and does NOT itself contact Google — execution is a separate,
 * explicit step through POST /api/ads/apply, which re-checks that the row is
 * approved before sending anything.
 *
 * Two steps rather than one on purpose: it keeps "I agree with this" separate
 * from "send it now", lets a batch be reviewed as a whole before any of it is
 * applied, and means a stray double-click on Approve cannot spend money.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { action?: string }
  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const { data: change, error: readErr } = await supabase
    .from('proposed_changes').select('*').eq('id', params.id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!change) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (change.status !== 'pending') {
    return NextResponse.json(
      { error: `This change is already ${change.status}.` }, { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const patch = action === 'approve'
    ? { status: 'approved', approved_at: now, decided_by: 'admin' }
    : { status: 'rejected', rejected_at: now, decided_by: 'admin' }

  const { error: updErr } = await supabase
    .from('proposed_changes').update(patch).eq('id', params.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const audit = [{
    proposed_change_id: params.id,
    action: action === 'approve' ? 'approved' : 'rejected',
    actor: 'admin',
    detail: { before: change.before_json, after: change.after_json, type: change.type },
  }]
  if (action === 'approve') {
    audit.push({
      proposed_change_id: params.id,
      action: 'approved',
      actor: 'system',
      detail: { note: 'Approved and queued. Nothing is sent to Google until Apply is run.' } as any,
    })
  }
  await supabase.from('change_audit').insert(audit)

  return NextResponse.json({
    ok: true,
    status: patch.status,
    applied: false,
    note: action === 'approve'
      ? 'Approved and logged. Nothing was pushed to Google — Ads writes arrive in Phase 2.'
      : 'Rejected and logged.',
  })
}
