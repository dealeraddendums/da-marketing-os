import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { buildSnapshot } from '@/lib/analyst/snapshot'
import { analyzeSnapshot } from '@/lib/analyst/analyze'
import { saveAnalysis, tryAcquireRun, releaseRun } from '@/lib/analyst/store'

export const dynamic = 'force-dynamic'
// A snapshot plus a reasoning call comfortably exceeds Next's default budget.
export const maxDuration = 300

/**
 * POST /api/analyst/run[?days=30]
 *
 * Build a snapshot from the live Google integrations, send it to Claude, store
 * the result, return the brief.
 *
 * Guarded against concurrent runs: each run costs money and takes tens of
 * seconds, so a second click while one is in flight gets 409, not a second
 * bill.
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lock = tryAcquireRun()
  if (!lock.ok) {
    return NextResponse.json({
      error: 'An analysis is already running',
      startedAt: new Date(lock.startedAt).toISOString(),
    }, { status: 409 })
  }

  const days = Math.min(Math.max(
    parseInt(new URL(req.url).searchParams.get('days') || '30', 10) || 30, 1), 365)

  try {
    const snapshot = await buildSnapshot(days)
    console.log(
      `[analyst] snapshot built: ~${snapshot.meta.approxTokens} tokens, ` +
      `sources ads=${snapshot.meta.sources.ads} gsc=${snapshot.meta.sources.gsc} ` +
      `ga4=${snapshot.meta.sources.ga4}, ${snapshot.meta.errors.length} source error(s)`,
    )

    // Nothing to analyse is a real outcome, not an empty brief: say so rather
    // than paying for a call over an empty object.
    const { ads, gsc, ga4 } = snapshot.meta.sources
    if (!ads && !gsc && !ga4) {
      return NextResponse.json({
        error: 'No Google data sources are available — connect Google on the Overview tab first.',
        sourceErrors: snapshot.meta.errors,
      }, { status: 503 })
    }

    const result = await analyzeSnapshot(snapshot)
    const saved = await saveAnalysis({
      trigger: 'manual',
      snapshot,
      brief: result.brief,
      // Keep the raw text only when it could not be parsed; a successful brief
      // is already stored structurally and the text would just double the row.
      rawResponse: result.status === 'ok' ? null : result.rawResponse,
      model: result.model,
      status: result.status,
      error: result.status === 'parse_error'
        ? 'Model response was not valid JSON matching the brief schema'
        : null,
      usage: result.usage,
      runMs: result.runMs,
    })

    return NextResponse.json({
      id: saved.id,
      status: result.status,
      brief: result.brief,
      rawResponse: result.status === 'ok' ? null : result.rawResponse,
      model: result.model,
      usage: result.usage,
      runMs: result.runMs,
      dateRange: snapshot.meta.dateRange,
      approxSnapshotTokens: snapshot.meta.approxTokens,
      sourceErrors: snapshot.meta.errors,
      measurementNotes: snapshot.measurement.notes,
      // Surfaced rather than thrown: the brief is still useful unsaved, and the
      // banner tells the operator exactly what to do about it.
      saveError: saved.saveError,
      migrationPending: saved.missingTable,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    console.error('[analyst] run failed:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    releaseRun()
  }
}
