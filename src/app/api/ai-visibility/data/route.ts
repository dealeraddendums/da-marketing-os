import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { buildReport, getCompetitors, getPrompts, getRunningRun } from '@/lib/ai-visibility/store'
import { ENGINE_DEFS } from '@/lib/ai-visibility/engines'
import { ENGINES } from '@/lib/ai-visibility/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/ai-visibility/data — everything the AI Visibility tab renders:
 * the report (scorecard, trend, grid, competitor table, gaps), the full
 * prompt/competitor lists for the manager, which engines have keys, and
 * whether a run is currently in flight (the tab polls while it is).
 */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [report, prompts, competitors, running] = await Promise.all([
      buildReport(), getPrompts(), getCompetitors(), getRunningRun(),
    ])
    const engineKeys: Record<string, boolean> = {}
    for (const e of ENGINES) engineKeys[e] = ENGINE_DEFS[e].available()

    return NextResponse.json({ report, prompts, competitors, engineKeys, running })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load'
    // Migration 025 not applied yet → explain instead of a bare 500.
    if (/ai_visibility|PGRST205|42P01/i.test(msg)) {
      return NextResponse.json({
        error: 'AI Visibility tables are missing — apply supabase/migrations/025_ai_visibility.sql to the marketing Supabase project.',
        detail: msg,
      }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
