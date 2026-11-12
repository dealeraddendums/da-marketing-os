import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { startVisibilityRun } from '@/lib/ai-visibility/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ai-visibility/run
 *
 * Kick off a full visibility audit: every active prompt × every engine with a
 * key configured. Returns 202 with the run id immediately — a full run is
 * ~100 engine calls at concurrency 3 (several minutes), well past nginx's
 * patience, so the work continues in-process (single PM2 fork) and the tab
 * polls GET /api/ai-visibility/data for the finished run.
 *
 * Auth: the admin cookie (the tab's Run now button), or
 * x-api-key === DA_CRON_KEY for the weekly scheduled run (mirrors /api/cron/*).
 *
 * Guards inside startVisibilityRun: one run at a time (409), hard cost cap $5
 * (400), no prompts (400), no keys (503).
 */
export async function POST(req: NextRequest) {
  const cronKey = req.headers.get('x-api-key')
  const viaCron = !!cronKey && !!process.env.DA_CRON_KEY && cronKey === process.env.DA_CRON_KEY
  if (!viaCron && !isAdminAuthed()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const outcome = await startVisibilityRun(viaCron ? 'scheduled' : 'manual')
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }

  // Fire-and-forget: the `done` promise finishes the run in the background.
  return NextResponse.json({
    started: true,
    runId: outcome.runId,
    jobs: outcome.jobs,
    engines: outcome.engines,
    estimatedCostUsd: Math.round(outcome.estimate * 100) / 100,
  }, { status: 202 })
}
