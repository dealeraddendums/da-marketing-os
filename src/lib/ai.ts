// Shared Claude access for the marketing app.
//
// Raw fetch against the Messages API, not the installed SDK — the same pattern
// as lib/analyst/analyze.ts, which is the one AI feature here that never broke.
//
// Why it is worth having one pattern: this module previously exported an
// `@anthropic-ai/sdk` client pinned at ^0.20.0 (2024-era) plus a hardcoded
// `claude-sonnet-4-20250514`. When that model was retired the API began
// answering 404 `not_found_error`, and because the model name lived in four
// separate files, four features died independently and silently. One module
// owning one model constant is what stops the next retirement doing that.
//
// The SDK remains a dependency: the two STREAMING routes (chat widget,
// reputation reply drafter) still use it, because hand-rolling SSE parsing to
// avoid a dependency that already works would be a downgrade. They import
// MODEL from here, so model choice is still decided in exactly one place.

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/**
 * The model for every non-streaming marketing AI feature, and for the two
 * streaming routes that import it.
 *
 * Sonnet 5 matches lib/analyst/analyze.ts's ANALYST_MODEL — these are short
 * copy/extraction tasks on a latency-sensitive public site, and the Analyst is
 * the proven-good precedent in this codebase. Override without a code change
 * by setting AI_MODEL in .env.production.
 *
 * Note the deliberate asymmetry: lib/hero-engine.ts keeps its OWN model
 * constants (HERO_MODEL / HERO_VALIDATOR_MODEL) because generating public
 * homepage copy is a different quality bar from drafting three ad variants.
 */
export const MODEL = process.env.AI_MODEL || 'claude-sonnet-5'

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

interface MessagesResponse {
  content?: { type: string; text?: string }[]
  stop_reason?: string
  error?: { type?: string; message?: string }
}

/**
 * One non-streaming call. Returns the joined text.
 *
 * Throws on transport/API failure so callers decide what a failure means —
 * lead enrichment treats it as non-blocking, the hero validator fails closed.
 */
export async function createMessage(params: {
  model?: string
  maxTokens?: number
  system?: string
  messages: AiMessage[]
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const body: Record<string, unknown> = {
    model: params.model || MODEL,
    max_tokens: params.maxTokens ?? 1000,
    messages: params.messages,
  }
  if (params.system) body.system = params.system

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  const raw = await res.text()
  if (!res.ok) {
    // Log the whole body. Anthropic's error JSON names the exact cause
    // ("model: claude-sonnet-4-20250514"), which is the difference between a
    // fix and three months of a feature quietly returning 500.
    console.error(`[ai] Messages API HTTP ${res.status} — raw body follows:\n${raw}`)
    let parsed: MessagesResponse | null = null
    try { parsed = JSON.parse(raw) as MessagesResponse } catch { /* HTML or empty */ }
    throw new Error(
      parsed?.error?.message || `Anthropic API returned HTTP ${res.status}: ${raw.slice(0, 400)}`,
    )
  }

  const json = JSON.parse(raw) as MessagesResponse
  // Select the text blocks rather than indexing [0]. A thinking block can
  // arrive first (with empty text under the default display setting), and
  // `content[0].text` then reads as an empty response from a call that
  // actually succeeded — a silent failure mode, not a loud one.
  const text = (json.content ?? [])
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text as string)
    .join('')
    .trim()

  if (json.stop_reason === 'max_tokens') {
    console.warn('[ai] response hit max_tokens — output is probably truncated')
  }
  return text
}

/** Unchanged signature — the original interface every caller was written against. */
export async function generateText(prompt: string, maxTokens = 1000): Promise<string> {
  return createMessage({
    maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
}

export function parseJSON<T>(text: string): T | null {
  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}
