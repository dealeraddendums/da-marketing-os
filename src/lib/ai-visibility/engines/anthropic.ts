// AI Visibility engine — Anthropic Claude with the web search server tool.
//
// Raw fetch against the Messages API — the house pattern (lib/ai.ts). Model is
// Haiku (the cheapest search-capable tier) with the basic web_search tool
// variant, which Haiku supports; ANTHROPIC_API_KEY is already on the box for
// the Analyst. Deliberately NOT routed through lib/ai.ts createMessage: that
// helper is text-only (no tools, no usage back) and its AI_MODEL constant
// steers copy generation, not this audit.

import type { EngineAnswer } from '../types'

const MODEL = process.env.AI_VISIBILITY_ANTHROPIC_MODEL || 'claude-haiku-5-5'

// Approximate price table (USD): Haiku 5.5 $0.10/M in, $0.50/M out,
// + $10/1k web searches (max 3 per call here).
const IN_PER_M = 0.10
const OUT_PER_M = 0.50
const SEARCH_PER_USE = 0.01

export const anthropicAvailable = () => !!process.env.ANTHROPIC_API_KEY
export const ANTHROPIC_EST_COST_PER_CALL = 0.025

interface AnthropicResponse {
  content?: {
    type: string
    text?: string
    citations?: { type?: string; url?: string }[]
    content?: unknown
  }[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    server_tool_use?: { web_search_requests?: number }
  }
  error?: { type?: string; message?: string }
}

export async function askAnthropic(prompt: string): Promise<EngineAnswer> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const started = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: prompt }],
    }),
    cache: 'no-store',
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`anthropic HTTP ${res.status}: ${raw.slice(0, 300)}`)
  }
  const data = JSON.parse(raw) as AnthropicResponse

  // Only text-block citations count — those are sources Claude actually cited
  // in its answer. web_search_tool_result blocks list every page the search
  // RETURNED, cited or not; counting those would inflate "cited" for all four
  // vendors' metrics.
  let answer = ''
  const citations: string[] = []
  for (const block of data.content || []) {
    if (block.type === 'text') {
      answer += block.text || ''
      for (const c of block.citations || []) {
        if (c?.url && citations.indexOf(c.url) === -1) citations.push(c.url)
      }
    }
  }

  const inTok = data.usage?.input_tokens ?? 0
  const outTok = data.usage?.output_tokens ?? 0
  const searches = data.usage?.server_tool_use?.web_search_requests ?? 0
  const costUsd = (inTok / 1e6) * IN_PER_M + (outTok / 1e6) * OUT_PER_M + searches * SEARCH_PER_USE

  return { answer, model: MODEL, citations, costUsd, latencyMs: Date.now() - started }
}
