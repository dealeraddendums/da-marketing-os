// AI Visibility — the audit runner.
//
// startVisibilityRun() checks the guards (one run at a time, hard cost cap),
// writes the run row, and returns immediately with a promise that performs the
// work: every active prompt × every available engine, concurrency-limited,
// each answer parsed deterministically and stored. A single engine failure is
// recorded on its result row — it never aborts the run.

import { askEngine, ENGINE_DEFS } from './engines'
import { parseAnswer } from './parse'
import {
  createRun, finishRun, getCompetitors, getPrompts, getRunningRun, insertResult,
} from './store'
import type { EngineId } from './types'
import { ENGINES } from './types'

/** Hard cap: refuse to start a run whose estimate exceeds this. */
export const COST_CAP_USD = 5

const CONCURRENCY = 3

export type StartOutcome =
  | { ok: true; runId: string; estimate: number; jobs: number; engines: EngineId[]; done: Promise<void> }
  | { ok: false; status: number; error: string }

/**
 * In-process double-start guard (single PM2 fork — same reasoning as
 * lib/analyst/store.ts). The DB 'running' row is the cross-restart backstop.
 */
let inFlight = false

export async function startVisibilityRun(trigger: string): Promise<StartOutcome> {
  if (inFlight) return { ok: false, status: 409, error: 'A visibility run is already in progress' }

  const running = await getRunningRun()
  if (running) {
    return {
      ok: false, status: 409,
      error: `A visibility run is already in progress (started ${running.started_at})`,
    }
  }

  const prompts = await getPrompts(true)
  if (!prompts.length) return { ok: false, status: 400, error: 'No active prompts to run' }

  const engines = ENGINES.filter(e => ENGINE_DEFS[e].available())
  if (!engines.length) {
    return {
      ok: false, status: 503,
      error: 'No engine API keys are configured (OPENAI_API_KEY / GEMINI_API_KEY / PERPLEXITY_API_KEY / ANTHROPIC_API_KEY)',
    }
  }
  const missing = ENGINES.filter(e => engines.indexOf(e) === -1)

  const estimate = engines.reduce(
    (sum, e) => sum + prompts.length * ENGINE_DEFS[e].estCostPerCall, 0)
  if (estimate > COST_CAP_USD) {
    return {
      ok: false, status: 400,
      error: `Estimated cost $${estimate.toFixed(2)} exceeds the $${COST_CAP_USD} cap — deactivate prompts or raise the cap in lib/ai-visibility/run.ts`,
    }
  }

  const competitors = await getCompetitors(true)
  const notes = `trigger=${trigger}; engines=${engines.join(',')}` +
    (missing.length ? `; skipped (no key): ${missing.join(',')}` : '')
  const run = await createRun(prompts.length, estimate, notes)

  inFlight = true
  const done = execute(run.id, prompts, competitors, engines, notes)
    .catch(err => {
      console.error('[ai-visibility] run crashed:', err instanceof Error ? err.message : err)
    })
    .finally(() => { inFlight = false })

  return { ok: true, runId: run.id, estimate, jobs: prompts.length * engines.length, engines, done }
}

async function execute(
  runId: string,
  prompts: { id: string; prompt_text: string }[],
  competitors: Awaited<ReturnType<typeof getCompetitors>>,
  engines: EngineId[],
  baseNotes: string,
): Promise<void> {
  interface Job { promptId: string; promptText: string; engine: EngineId }
  const jobs: Job[] = []
  for (const p of prompts) for (const e of engines) {
    jobs.push({ promptId: p.id, promptText: p.prompt_text, engine: e })
  }

  let actualCost = 0
  let failures = 0
  let next = 0

  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next]
      next += 1
      try {
        const ans = await askEngine(job.engine, job.promptText)
        const parsed = parseAnswer(ans.answer, ans.citations, competitors)
        actualCost += ans.costUsd
        await insertResult({
          run_id: runId,
          prompt_id: job.promptId,
          engine: job.engine,
          model: ans.model,
          raw_answer: ans.answer,
          da_mentioned: parsed.da_mentioned,
          da_cited_url: parsed.da_cited_url,
          competitors_mentioned: parsed.competitors_mentioned,
          cited_domains: parsed.cited_domains,
          position_rank: parsed.position_rank,
          latency_ms: ans.latencyMs,
          token_cost_usd: Math.round(ans.costUsd * 100000) / 100000,
          error: null,
        })
      } catch (e) {
        failures += 1
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[ai-visibility] ${job.engine} failed on "${job.promptText.slice(0, 60)}": ${msg}`)
        try {
          await insertResult({
            run_id: runId,
            prompt_id: job.promptId,
            engine: job.engine,
            model: '',
            raw_answer: '',
            da_mentioned: false,
            da_cited_url: null,
            competitors_mentioned: [],
            cited_domains: [],
            position_rank: null,
            latency_ms: null,
            token_cost_usd: null,
            error: msg.slice(0, 500),
          })
        } catch (dbErr) {
          console.error('[ai-visibility] failed to record failure row:',
            dbErr instanceof Error ? dbErr.message : dbErr)
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()),
  )

  const status = failures === 0 ? 'ok' : failures === jobs.length ? 'error' : 'partial'
  const notes = `${baseNotes}; jobs=${jobs.length}; failed=${failures}; actual_cost=$${actualCost.toFixed(4)}`
  await finishRun(runId, status, actualCost, notes)
  console.log(`[ai-visibility] run ${runId} ${status}: ${jobs.length - failures}/${jobs.length} answers, $${actualCost.toFixed(4)}`)
}
