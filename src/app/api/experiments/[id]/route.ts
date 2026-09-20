import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { withResult, type ExperimentRow } from '@/lib/experiments'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/experiments/:id
 *
 * The editable surface is deliberately narrow: spend (the one number a human
 * owns), the decision, and the plan fields. Nothing here recomputes or stores a
 * result — results are derived on read, so there is no cached number that a
 * patch could leave stale.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (b.spend !== undefined) {
    const spend = Number(b.spend)
    if (!Number.isFinite(spend) || spend < 0) {
      return NextResponse.json({ error: 'spend must be a non-negative number' }, { status: 400 })
    }
    patch.spend = spend
    // Stamped on every spend write, because the age of this figure is what
    // decides whether cost-per-trial is worth reading.
    patch.spend_updated_at = new Date().toISOString()
  }

  if (b.decision !== undefined) {
    const d = String(b.decision)
    if (d !== 'running' && d !== 'keep' && d !== 'kill') {
      return NextResponse.json(
        { error: "decision must be 'running', 'keep' or 'kill'" }, { status: 400 },
      )
    }
    patch.decision = d
    patch.decided_at = d === 'running' ? null : new Date().toISOString()
  }

  if (b.budget_cap !== undefined) {
    patch.budget_cap = b.budget_cap === '' || b.budget_cap === null ? null : Number(b.budget_cap)
  }
  if (b.end_date !== undefined) patch.end_date = b.end_date ? String(b.end_date) : null
  if (b.start_date !== undefined && b.start_date) patch.start_date = String(b.start_date)
  if (b.threshold !== undefined) {
    const t = Number(b.threshold)
    if (!Number.isFinite(t) || t < 1) {
      return NextResponse.json({ error: 'threshold must be at least 1' }, { status: 400 })
    }
    patch.threshold = Math.round(t)
  }
  if (b.notes !== undefined) patch.notes = b.notes ? String(b.notes) : null

  const { data, error } = await supabase
    .from('channel_experiments').update(patch as never).eq('id', params.id)
    .select('*').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ok: true, experiment: await withResult(data as unknown as ExperimentRow),
  })
}

/** DELETE /api/experiments/:id — for a mis-typed row. Leads are untouched. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('channel_experiments').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
