import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/proposed-changes/:id  { action: 'approve' | 'reject' }
 *
 * PHASE 1: approving records the decision and writes the audit trail, but does
 * NOT push anything to Google — there is no Ads write path in this phase, by
 * design. An approved change therefore lands in 'approved', never 'applied',
 * and the audit log records `apply_skipped_phase1` so the gap is explicit
 * rather than looking like a silent failure.
 *
 * TODO (Phase 2): on approve, dispatch on `type` to the Ads mutate client,
 * then transition approved → applied (or failed, with `error` set) and log
 * `applied` / `apply_failed`. Budget caps get enforced there, at the point of
 * application, not here.
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
      action: 'apply_skipped_phase1',
      actor: 'system',
      detail: { note: 'Phase 1 is read-only; no Ads mutation was sent to Google.' } as any,
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
