import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { isMissingTable, MIGRATION_HINT, type AnalysisRow } from '@/lib/analyst/store'

export const dynamic = 'force-dynamic'

/** GET /api/analyst/latest — the most recent run, with its full brief. */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('analyses')
    .select('id, created_at, trigger, date_range, brief, raw_response, model, status, error')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) {
      // Not an error state for the UI — the feature simply has no storage yet.
      return NextResponse.json({ analysis: null, migrationPending: true, detail: MIGRATION_HINT })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }
  return NextResponse.json({ analysis: (data as AnalysisRow | null) ?? null })
}
