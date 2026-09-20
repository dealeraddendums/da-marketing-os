import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import {
  withResult, isMissingExperimentsTable, EXPERIMENTS_MIGRATION_HINT,
  type ExperimentRow,
} from '@/lib/experiments'

export const dynamic = 'force-dynamic'

/**
 * GET /api/experiments — every channel experiment, with results computed from
 * first-party lead data at request time.
 *
 * Nothing is cached and nothing is stored: the numbers are derived from
 * marketing_leads on every read, so a lead that confirms an hour from now is
 * reflected on the next page load. There is no snapshot to go stale, which is
 * the opposite of the Ads results path — there, Google will not return an old
 * window again, so the "before" has to be frozen at apply time. Here we own the
 * table and can always recompute.
 */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('channel_experiments')
    .select('*')
    .order('start_date', { ascending: false })

  if (error) {
    if (isMissingExperimentsTable(error)) {
      return NextResponse.json({
        experiments: [], migrationPending: true, detail: EXPERIMENTS_MIGRATION_HINT,
      })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }

  const rows = (data as unknown as ExperimentRow[]) ?? []
  const experiments = []
  for (let i = 0; i < rows.length; i++) {
    try {
      experiments.push(await withResult(rows[i]))
    } catch (err) {
      // One unreadable experiment must not blank the whole view.
      experiments.push({
        ...rows[i],
        result: null,
        resultError: err instanceof Error ? err.message : 'could not compute results',
      })
    }
  }

  return NextResponse.json({ experiments })
}

/** POST /api/experiments — create one. */
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(b.name || '').trim()
  const channel = String(b.channel || '').trim()
  // Normalised to lower case at the door: UTM values are compared
  // case-insensitively everywhere else, and storing the shape we compare in
  // keeps the stored value and the matcher from drifting apart.
  const utmSource = String(b.utm_source || '').trim().toLowerCase()
  const startDate = String(b.start_date || '').trim()

  if (!name || !channel || !utmSource || !startDate) {
    return NextResponse.json(
      { error: 'name, channel, utm_source and start_date are required' }, { status: 400 },
    )
  }
  if (/\s/.test(utmSource)) {
    return NextResponse.json(
      { error: 'utm_source cannot contain spaces — it has to match what the ad URL sends.' },
      { status: 400 },
    )
  }

  const threshold = Number(b.threshold)
  const row = {
    name, channel, utm_source: utmSource, start_date: startDate,
    end_date: b.end_date ? String(b.end_date) : null,
    budget_cap: b.budget_cap === '' || b.budget_cap == null ? null : Number(b.budget_cap),
    spend: Number(b.spend || 0),
    spend_updated_at: Number(b.spend || 0) > 0 ? new Date().toISOString() : null,
    threshold: Number.isFinite(threshold) && threshold > 0 ? Math.round(threshold) : 1,
    notes: b.notes ? String(b.notes) : null,
  }

  const { data, error } = await supabase
    .from('channel_experiments').insert(row as never).select('*').maybeSingle()

  if (error) {
    if (isMissingExperimentsTable(error)) {
      return NextResponse.json({ error: EXPERIMENTS_MIGRATION_HINT }, { status: 503 })
    }
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `An experiment named "${name}" already exists.` }, { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, experiment: await withResult(data as unknown as ExperimentRow) })
}
