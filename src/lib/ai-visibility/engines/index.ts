// AI Visibility — engine registry.
//
// One adapter per engine behind a common ask(prompt) → EngineAnswer interface.
// askEngine() adds the shared reliability policy: retry ONCE on 429/5xx/network
// with a short jittered backoff, never on other 4xx (a bad key or model name
// will not fix itself), and let the final failure throw — the runner records it
// on the result row instead of aborting the run.

import type { EngineAnswer, EngineId } from '../types'
import { askOpenAI, openaiAvailable, OPENAI_EST_COST_PER_CALL } from './openai'
import { askGemini, geminiAvailable, GEMINI_EST_COST_PER_CALL } from './gemini'
import { askPerplexity, perplexityAvailable, PERPLEXITY_EST_COST_PER_CALL } from './perplexity'
import { askAnthropic, anthropicAvailable, ANTHROPIC_EST_COST_PER_CALL } from './anthropic'

interface EngineDef {
  ask: (prompt: string) => Promise<EngineAnswer>
  available: () => boolean
  /** Conservative per-call estimate (USD) for the pre-run cost cap. */
  estCostPerCall: number
}

export const ENGINE_DEFS: Record<EngineId, EngineDef> = {
  openai:     { ask: askOpenAI,     available: openaiAvailable,     estCostPerCall: OPENAI_EST_COST_PER_CALL },
  gemini:     { ask: askGemini,     available: geminiAvailable,     estCostPerCall: GEMINI_EST_COST_PER_CALL },
  perplexity: { ask: askPerplexity, available: perplexityAvailable, estCostPerCall: PERPLEXITY_EST_COST_PER_CALL },
  anthropic:  { ask: askAnthropic,  available: anthropicAvailable,  estCostPerCall: ANTHROPIC_EST_COST_PER_CALL },
}

const RETRYABLE = /HTTP (429|5\d\d)|fetch failed|ECONNRESET|ETIMEDOUT|network/i

export async function askEngine(engine: EngineId, prompt: string): Promise<EngineAnswer> {
  const def = ENGINE_DEFS[engine]
  try {
    return await def.ask(prompt)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!RETRYABLE.test(msg)) throw e
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
    return def.ask(prompt)
  }
}
