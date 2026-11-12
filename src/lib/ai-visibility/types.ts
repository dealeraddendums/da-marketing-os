// AI Visibility — shared types.
//
// The audit asks a fixed prompt list across four AI engines and records whether
// DealerAddendums is mentioned/cited and which competitors are. Everything here
// is deliberately plain data: the engines return a common EngineAnswer, the
// parser is a pure function over it, and the runner persists ParsedResult rows.

export type EngineId = 'openai' | 'gemini' | 'perplexity' | 'anthropic'

export const ENGINES: EngineId[] = ['openai', 'gemini', 'perplexity', 'anthropic']

export interface EngineAnswer {
  /** The assistant's answer text. */
  answer: string
  /** Exact model that answered. */
  model: string
  /**
   * Native citations from the engine, where it provides them (Perplexity
   * citations, Anthropic web_search result URLs, OpenAI url_citation
   * annotations, Gemini grounding chunks). Entries are URLs, or bare domains
   * where the engine only exposes a redirect URL plus the source domain
   * (Gemini's vertexaisearch redirects carry the real domain in the title).
   */
  citations: string[]
  /** Dollar cost of this one call, from usage + the engine's price table. */
  costUsd: number
  latencyMs: number
}

export interface CompetitorDef {
  id: string
  name: string
  domains: string[]
  aliases: string[]
  active: boolean
}

export interface PromptDef {
  id: string
  prompt_text: string
  category: string
  active: boolean
  sort_order: number
}

export interface ParsedAnswer {
  da_mentioned: boolean
  da_cited_url: string | null
  competitors_mentioned: string[]
  cited_domains: string[]
  position_rank: number | null
}
