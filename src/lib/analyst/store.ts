// Persistence for analysis runs, plus the concurrency guard.

import { supabase } from '@/lib/supabase'
import type { AnalystSnapshot } from './snapshot'
import type { Brief, Usage } from './analyze'

export interface AnalysisRow {
  id: string
  created_at: string
  trigger: string
  date_range: { startDate?: string; endDate?: string; days?: number }
  snapshot: AnalystSnapshot | null
  brief: Brief | null
  raw_response: string | null
  model: string
  status: 'ok' | 'parse_error' | 'error'
  error: string | null
}

/**
 * Is this error "migration 012 has not been applied yet"?
 *
 * Detected so the routes can say exactly that instead of surfacing an opaque
 * database error. Both shapes are real and were both observed: supabase-js
 * normally answers through PostgREST, which reports an unknown relation as
 * **PGRST205 — "Could not find the table 'public.analyses' in the schema
 * cache"** (this is what actually came back on the first live run; matching
 * only Postgres's own 42P01 silently missed it), while a direct Postgres error
 * surfaces as 42P01 "relation ... does not exist".
 */
export function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205' || err.code === '42P01') return true
  const m = err.message || ''
  return /relation .*analyses.* does not exist/i.test(m) ||
         /could not find the table .*analyses.*/i.test(m)
}

export const MIGRATION_HINT =
  'The `analyses` table does not exist yet — apply supabase/migrations/012_analyst.sql ' +
  'in the Supabase SQL editor (project huqohncglbshwuzeguvb). The brief above was ' +
  'generated successfully but could not be saved.'

/**
 * In-process guard against concurrent runs.
 *
 * da-marketing runs as a single PM2 fork, so one process is the whole app and a
 * module-level flag is a real lock — the same reasoning lib/google/cache.ts
 * relies on. If this ever runs clustered this becomes per-worker and would need
 * to move into the database (an 'in_flight' row, or a Postgres advisory lock).
 * Worth guarding because a run costs money and takes tens of seconds, so a
 * double-click should not buy two briefs.
 */
let inFlight: { startedAt: number } | null = null
const MAX_RUN_MS = 5 * 60 * 1000

export function tryAcquireRun(): { ok: true } | { ok: false; startedAt: number } {
  if (inFlight && Date.now() - inFlight.startedAt < MAX_RUN_MS) {
    return { ok: false, startedAt: inFlight.startedAt }
  }
  // A stale flag (process wedged mid-run, or a crash between acquire and
  // release) must not lock the feature out forever.
  inFlight = { startedAt: Date.now() }
  return { ok: true }
}

export function releaseRun(): void { inFlight = null }

export async function saveAnalysis(input: {
  trigger: string
  snapshot: AnalystSnapshot
  brief: Brief | null
  rawResponse: string | null
  model: string
  status: 'ok' | 'parse_error' | 'error'
  error: string | null
  usage: Usage
  runMs: number
}): Promise<{ id: string | null; saveError: string | null; missingTable: boolean }> {
  const { data, error } = await supabase
    .from('analyses')
    .insert({
      trigger: input.trigger,
      date_range: {
        ...input.snapshot.meta.dateRange,
        // Run metadata rides along in date_range rather than in new columns:
        // it is presentational (the "model · 8.2s · ~$0.04" line), and adding
        // columns for it would mean another migration for a caption.
        usage: input.usage,
        runMs: input.runMs,
        approxSnapshotTokens: input.snapshot.meta.approxTokens,
      },
      snapshot: input.snapshot,
      brief: input.brief,
      raw_response: input.rawResponse,
      model: input.model,
      status: input.status,
      error: input.error,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[analyst] saving analysis failed:', error.message, error.code ?? '')
    return {
      id: null,
      saveError: isMissingTable(error) ? MIGRATION_HINT : error.message,
      missingTable: isMissingTable(error),
    }
  }
  return { id: data?.id ?? null, saveError: null, missingTable: false }
}
