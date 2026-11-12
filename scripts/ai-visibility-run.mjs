// AI Visibility — scheduled weekly audit entry point.
//
// PM2 cron calls this (Sunday 03:00 Pacific — see README "AI Visibility").
// It kicks the run off through the same API route the admin tab uses
// (x-api-key = DA_CRON_KEY), then polls the run row via PostgREST until it
// finishes, printing the outcome so `pm2 logs ai-visibility-weekly` shows a
// one-line verdict per week. Exit 0 on ok/partial, 1 on error/timeout.
//
// Runs against the LOCAL app (127.0.0.1:3020) — never point this at a box
// that doesn't serve the live site.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

// Minimal .env.production reader — this runs outside Next, which normally
// loads that file. Values already exported into the environment win.
function loadEnv() {
  const envPath = path.join(here, '..', '.env.production')
  let text = ''
  try { text = readFileSync(envPath, 'utf8') } catch { return }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    if (process.env[key] !== undefined) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[key] = v
  }
}
loadEnv()

const APP = process.env.AI_VISIBILITY_APP_URL || 'http://127.0.0.1:3020'
const CRON_KEY = process.env.DA_CRON_KEY
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!CRON_KEY) { console.error('[ai-visibility] DA_CRON_KEY is not set'); process.exit(1) }
if (!SUPA || !SRK) { console.error('[ai-visibility] Supabase env vars are not set'); process.exit(1) }

async function getRun(runId) {
  const res = await fetch(
    `${SUPA}/rest/v1/ai_visibility_runs?id=eq.${runId}&select=status,finished_at,cost_estimate_usd,notes`,
    { headers: { apikey: SRK, authorization: `Bearer ${SRK}` } },
  )
  if (!res.ok) throw new Error(`run poll HTTP ${res.status}`)
  const rows = await res.json()
  return rows[0] || null
}

const started = Date.now()
const kick = await fetch(`${APP}/api/ai-visibility/run`, {
  method: 'POST',
  headers: { 'x-api-key': CRON_KEY },
})
const body = await kick.json().catch(() => ({}))
if (!kick.ok) {
  console.error(`[ai-visibility] kickoff refused (HTTP ${kick.status}): ${body.error || 'unknown'}`)
  process.exit(1)
}
console.log(`[ai-visibility] run ${body.runId} started — ${body.jobs} calls on ${body.engines.join(', ')} (~$${body.estimatedCostUsd})`)

// Poll up to 30 minutes.
const DEADLINE = Date.now() + 30 * 60 * 1000
let run = null
while (Date.now() < DEADLINE) {
  await new Promise(r => setTimeout(r, 20000))
  try { run = await getRun(body.runId) } catch (e) { console.error(`[ai-visibility] poll: ${e.message}`) }
  if (run && run.status !== 'running') break
}

if (!run || run.status === 'running') {
  console.error(`[ai-visibility] run did not finish within 30 min — check the AI Visibility tab`)
  process.exit(1)
}
const mins = Math.round((Date.now() - started) / 6000) / 10
console.log(`[ai-visibility] finished ${run.status} in ${mins} min — cost $${run.cost_estimate_usd} — ${run.notes || ''}`)
process.exit(run.status === 'error' ? 1 : 0)
