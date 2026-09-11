// Persistence + concurrency for Deep Ads Analysis runs.

import { supabase } from '@/lib/supabase'

/** Same single-PM2-fork reasoning as lib/analyst/store.ts and
 *  lib/google/cache.ts: one process is the whole app, so a module flag is a
 *  real lock. Keyed per account so two accounts can be analysed in parallel. */
const inFlight = new Map<string, number>()
const MAX_RUN_MS = 10 * 60 * 1000

export function tryAcquireAdsRun(customerId: string): { ok: true } | { ok: false; startedAt: number } {
  const started = inFlight.get(customerId)
  if (started && Date.now() - started < MAX_RUN_MS) return { ok: false, startedAt: started }
  inFlight.set(customerId, Date.now())
  return { ok: true }
}
export function releaseAdsRun(customerId: string): void { inFlight.delete(customerId) }

export function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205' || err.code === '42P01') return true
  const m = err.message || ''
  return /relation .* does not exist/i.test(m) || /could not find the table/i.test(m)
}

export const MIGRATION_HINT =
  'Apply supabase/migrations/014_ads_phase2.sql in the Supabase SQL editor ' +
  '(project huqohncglbshwuzeguvb) — the ads_analyses table and the new ' +
  'proposed_changes columns do not exist yet.'

export async function auditLog(rows: {
  proposed_change_id?: string | null
  action: string
  actor: string
  detail: unknown
}[]): Promise<void> {
  if (!rows.length) return
  const { error } = await supabase.from('change_audit').insert(rows as never)
  if (error) console.error('[ads] change_audit insert failed:', error.message)
}
