// AI Visibility engine — Perplexity Sonar.
//
// Perplexity is search-native and returns citations as a first-class field, so
// this is the most direct read on "what an answer engine cites".

import type { EngineAnswer } from '../types'

const MODEL = process.env.AI_VISIBILITY_PERPLEXITY_MODEL || 'sonar'

// Approximate price table (USD): sonar $1/M in, $1/M out, + ~$5/1k searches.
const IN_PER_M = 1.0
const OUT_PER_M = 1.0
const SEARCH_PER_CALL = 0.005

export const perplexityAvailable = () => !!process.env.PERPLEXITY_API_KEY
export const PERPLEXITY_EST_COST_PER_CALL = 0.008

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[]
  citations?: string[]
  search_results?: { url?: string }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

export async function askPerplexity(prompt: string): Promise<EngineAnswer> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not set')

  const started = Date.now()
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
    }),
    cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`perplexity HTTP ${res.status}: ${raw.slice(0, 300)}`)
  }
  const data = JSON.parse(raw) as PerplexityResponse
  const answer = data.choices?.[0]?.message?.content || ''

  const citations: string[] = []
  for (const c of data.citations || []) if (c) citations.push(c)
  for (const r of data.search_results || []) {
    if (r?.url && citations.indexOf(r.url) === -1) citations.push(r.url)
  }

  const inTok = data.usage?.prompt_tokens ?? 0
  const outTok = data.usage?.completion_tokens ?? 0
  const costUsd = (inTok / 1e6) * IN_PER_M + (outTok / 1e6) * OUT_PER_M + SEARCH_PER_CALL

  return { answer, model: MODEL, citations, costUsd, latencyMs: Date.now() - started }
}
