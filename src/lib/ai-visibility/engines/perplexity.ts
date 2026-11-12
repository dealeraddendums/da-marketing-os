// AI Visibility engine — Perplexity (Agent API).
//
// Perplexity retired Sonar's /chat/completions (403 agent_api_migration_required
// as of 2026-11 on newly provisioned accounts); the replacement is the Agent
// API's /v1/responses, where `effort` replaces the model knob (sonar → "fast").
// Search is still first-class: the response carries a search_results output
// item, and usage.cost.total_cost is Perplexity's own USD price for the call —
// recorded as-is, no local price table needed.

import type { EngineAnswer } from '../types'

const EFFORT = process.env.AI_VISIBILITY_PERPLEXITY_EFFORT || 'fast'

export const perplexityAvailable = () => !!process.env.PERPLEXITY_API_KEY
// Observed ~$0.002/call at effort=fast; padded for cap headroom.
export const PERPLEXITY_EST_COST_PER_CALL = 0.005

interface AgentResponse {
  model?: string
  output?: {
    type?: string
    content?: { type?: string; text?: string }[]
    results?: { url?: string }[]
  }[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cost?: { total_cost?: number }
  }
  error?: { message?: string } | null
}

export async function askPerplexity(prompt: string): Promise<EngineAnswer> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not set')

  const started = Date.now()
  const res = await fetch('https://api.perplexity.ai/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      effort: EFFORT,
      input: prompt,
      max_output_tokens: 1024,
    }),
    cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`perplexity HTTP ${res.status}: ${raw.slice(0, 300)}`)
  }
  const data = JSON.parse(raw) as AgentResponse

  let answer = ''
  const citations: string[] = []
  for (const item of data.output || []) {
    if (item?.type === 'message') {
      for (const part of item.content || []) {
        if (part?.type === 'output_text' && part.text) answer += part.text
      }
    } else if (item?.type === 'search_results') {
      for (const r of item.results || []) {
        if (r?.url && citations.indexOf(r.url) === -1) citations.push(r.url)
      }
    }
  }

  // Perplexity prices the call itself; fall back to a flat estimate if absent.
  const costUsd = data.usage?.cost?.total_cost ?? PERPLEXITY_EST_COST_PER_CALL

  const model = data.model ? `agent:${EFFORT} (${data.model})` : `agent:${EFFORT}`
  return { answer, model, citations, costUsd, latencyMs: Date.now() - started }
}
