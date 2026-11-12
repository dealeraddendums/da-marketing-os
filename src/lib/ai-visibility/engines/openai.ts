// AI Visibility engine — OpenAI (ChatGPT) with live web search.
//
// Chat Completions with a *-search-preview model: these have web search built
// in (no tool declaration needed) and return url_citation annotations, so the
// answer reflects live retrieval rather than training data. Raw fetch — the
// house pattern (lib/ai.ts); no SDK dependency.

import type { EngineAnswer } from '../types'

// gpt-4o-mini-search-preview was deprecated by OpenAI (404 as of 2026-11);
// gpt-5-search-api is the only *search* chat model on the account.
const MODEL = process.env.AI_VISIBILITY_OPENAI_MODEL || 'gpt-5-search-api'

// Approximate price table (USD) for gpt-5-search-api. Keep in sync with README
// "Cost expectations". Search results are injected as prompt tokens (~15-20k
// per call), which dominates the cost.
const IN_PER_M = 1.25
const OUT_PER_M = 10.0
const SEARCH_PER_CALL = 0.025 // web-search fee, ~$25 per 1k calls

export const openaiAvailable = () => !!process.env.OPENAI_API_KEY
export const OPENAI_EST_COST_PER_CALL = 0.06

interface ChatResponse {
  choices?: {
    message?: {
      content?: string
      annotations?: { type?: string; url_citation?: { url?: string } }[]
    }
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

export async function askOpenAI(prompt: string): Promise<EngineAnswer> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const started = Date.now()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      web_search_options: {},
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
    cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`openai HTTP ${res.status}: ${raw.slice(0, 300)}`)
  }
  const data = JSON.parse(raw) as ChatResponse
  const msg = data.choices?.[0]?.message
  const answer = msg?.content || ''
  const citations = (msg?.annotations || [])
    .map(a => a?.url_citation?.url || '')
    .filter(Boolean)

  const inTok = data.usage?.prompt_tokens ?? 0
  const outTok = data.usage?.completion_tokens ?? 0
  const costUsd = (inTok / 1e6) * IN_PER_M + (outTok / 1e6) * OUT_PER_M + SEARCH_PER_CALL

  return { answer, model: MODEL, citations, costUsd, latencyMs: Date.now() - started }
}
