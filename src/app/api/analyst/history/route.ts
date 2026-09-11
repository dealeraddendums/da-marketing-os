import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { isMissingTable, MIGRATION_HINT } from '@/lib/analyst/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analyst/history[?limit=20][&id=<uuid>]
 *
 * Without `id`: a light list for the history panel — no snapshot, no brief, so
 * the payload stays small however many runs accumulate.
 * With `id`: that one run's full brief, for expanding a history entry.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100)

  if (id) {
    const { data, error } = await supabase
      .from('analyses')
      .select('id, created_at, trigger, date_range, brief, raw_response, model, status, error')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ analysis: null, migrationPending: true, detail: MIGRATION_HINT })
      }
      return NextResponse.json({ error: error.message }, { status: 502 })
    }
    return NextResponse.json({ analysis: data ?? null })
  }

  const { data, error } = await supabase
    .from('analyses')
    .select('id, created_at, trigger, date_range, model, status, error')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ analyses: [], migrationPending: true, detail: MIGRATION_HINT })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }

  // A summary line per run for the collapsed list: enough to pick one without
  // shipping every brief in the list payload.
  return NextResponse.json({
    analyses: (data ?? []).map(r => ({
      id: r.id,
      createdAt: r.created_at,
      trigger: r.trigger,
      dateRange: r.date_range,
      model: r.model,
      status: r.status,
      error: r.error,
    })),
  })
}
