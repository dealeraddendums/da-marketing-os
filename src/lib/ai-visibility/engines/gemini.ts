// AI Visibility engine — Google Gemini with Search grounding.
//
// generateContent with the google_search tool, so answers reflect live Google
// results. Grounding citations come back as groundingChunks whose `uri` is a
// vertexaisearch redirect — the real source domain is in `title`, so we emit
// the title as a bare domain when it looks like one (parse.ts accepts both).

import type { EngineAnswer } from '../types'

// gemini-2.5-flash is retired for new accounts (404 "no longer available to
// new users" as of 2026-11); gemini-3.8-flash is its replacement.
const MODEL = process.env.AI_VISIBILITY_GEMINI_MODEL || 'gemini-3.8-flash'

// Approximate price table (USD) for gemini-3.8-flash at the intro rates in
// force through 2026-12-31 — both token rates DOUBLE on 2027-01-01 ($1.50 /
// $7.50). Grounded queries bill ~$14/1k beyond a 5k/month free tier; counted
// at full rate to keep the cap conservative.
const IN_PER_M = 0.75
const OUT_PER_M = 3.75
const GROUNDING_PER_CALL = 0.014

export const geminiAvailable = () => !!process.env.GEMINI_API_KEY
export const GEMINI_EST_COST_PER_CALL = 0.02

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[]
    }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  error?: { message?: string }
}

export async function askGemini(prompt: string): Promise<EngineAnswer> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const started = Date.now()
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 1024 },
      }),
      cache: 'no-store',
    },
  )
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`gemini HTTP ${res.status}: ${raw.slice(0, 300)}`)
  }
  const data = JSON.parse(raw) as GeminiResponse
  const cand = data.candidates?.[0]
  const answer = (cand?.content?.parts || []).map(p => p?.text || '').join('')

  const citations: string[] = []
  for (const chunk of cand?.groundingMetadata?.groundingChunks || []) {
    const uri = chunk?.web?.uri || ''
    const title = chunk?.web?.title || ''
    // Redirect URLs hide the source; the title usually IS the source domain.
    if (uri.includes('vertexaisearch.cloud.google.com')) {
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title)) citations.push(title)
    } else if (uri) {
      citations.push(uri)
    }
  }

  const inTok = data.usageMetadata?.promptTokenCount ?? 0
  const outTok = data.usageMetadata?.candidatesTokenCount ?? 0
  const costUsd = (inTok / 1e6) * IN_PER_M + (outTok / 1e6) * OUT_PER_M + GROUNDING_PER_CALL

  return { answer, model: MODEL, citations, costUsd, latencyMs: Date.now() - started }
}
