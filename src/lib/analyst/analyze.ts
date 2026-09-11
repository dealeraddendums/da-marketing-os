// Analyst — send a marketing snapshot to Claude, get back a structured brief.
//
// Raw fetch against the Messages API rather than the installed SDK, on purpose:
// this project pins @anthropic-ai/sdk at ^0.20.0 (2024-era), which predates the
// parameters used below, and `lib/ai.ts` — the shared SDK client — also backs
// the live chat widget and the reputation reply drafter. Bumping the SDK to
// reach newer parameters would put those two features on a different client
// version for no reason connected to this work. One `fetch` keeps the change
// contained and adds no dependency.

import type { AnalystSnapshot } from './snapshot'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/** Named separately from lib/ai.ts's MODEL so this cannot silently change the
 *  chat widget or the reputation drafter, which use a different model. */
export const ANALYST_MODEL = 'claude-sonnet-5'

/** Published per-million-token rates for the model above, used only for the
 *  rough cost line in the UI. Update alongside ANALYST_MODEL. */
const PRICE_PER_MTOK = { input: 2.0, output: 10.0 }

export type Severity = 'critical' | 'warning' | 'opportunity' | 'info'
export type Area = 'ads' | 'seo' | 'analytics' | 'measurement'
export type Effort = 'low' | 'med' | 'high'

export interface Finding {
  severity: Severity
  area: Area
  title: string
  evidence: string
  diagnosis: string
}

export interface Recommendation {
  priority: number
  action: string
  rationale: string
  expected_impact: string
  effort: Effort
  watch_metric: string
}

export interface Brief {
  summary: string
  findings: Finding[]
  recommendations: Recommendation[]
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface AnalyzeResult {
  status: 'ok' | 'parse_error'
  brief: Brief | null
  rawResponse: string
  model: string
  usage: Usage
  runMs: number
}

const SYSTEM_PROMPT = `You are a senior SEO/SEM analyst producing an internal brief for two Google Ads/Analytics/Search Console accounts owned by the same operator.

ACCOUNT 1 — DealerAddendums: a B2B SaaS company selling addendum and window-label printing software to franchise car dealerships, with roughly 2,100 dealership clients. The single conversion goal is a DEALER TRIAL SIGNUP originating on the marketing site. Buyers are dealership General Managers, General Sales Managers and dealer principals — a small, high-value, non-impulse audience. Judge everything against cost per qualified trial signup, not raw traffic.

ACCOUNT 2 — The Little Farm on Olga Rd: a small local/ecommerce brand that merely shares the same Google login. Analyse it as a small local advertiser on its own terms. Never blend its numbers into DealerAddendums conclusions, and never recommend B2B SaaS tactics for it.

HOW TO ANALYSE

1. MEASUREMENT INTEGRITY COMES FIRST. Before any campaign or keyword advice, establish whether the numbers can be trusted. The snapshot contains a "measurement" object listing known instrumentation gaps — read it first and treat it as authoritative. If conversions are zero or unrecorded, say plainly that conversion-based optimisation is impossible until tracking is fixed, and put that ahead of every tactical suggestion. A brief that recommends bid or budget changes while the conversion signal is broken is a bad brief: you would be optimising toward a metric that is not being recorded. At least one "critical" finding in area "measurement" is required whenever the measurement object reports any gap.

2. Distinguish "zero happened" from "zero recorded". A 0 next to real clicks or sessions is nearly always instrumentation, not performance. Never congratulate or criticise performance on the basis of an unrecorded metric.

3. Cite real numbers. Every finding's "evidence" field must quote actual figures from the snapshot — impressions, clicks, CTR, cost, average position, query text, campaign names. No evidence field may be generic. If you cannot support a claim with a number from the snapshot, leave the claim out.

4. Separate diagnosis from observation. "CTR is 1.1%" is an observation; the diagnosis explains why and what it implies. Say when a cause is uncertain rather than asserting one.

5. Be honest about small numbers. Where a figure is too small to support a conclusion, say so instead of over-reading it. Do not invent trends from a handful of clicks.

6. Prioritise by expected value, not ease. Recommendations are ordered by what most moves qualified trial signups, with priority 1 the most important. Tracking fixes usually outrank campaign tweaks because everything downstream depends on them.

OUTPUT FORMAT

Respond with a single JSON object and nothing else. No prose before or after, no markdown code fences. The object must match this schema exactly:

{
  "summary": string — 2-4 sentences an executive can read alone; lead with the most consequential fact, including any measurement problem,
  "findings": [
    {
      "severity": "critical" | "warning" | "opportunity" | "info",
      "area": "ads" | "seo" | "analytics" | "measurement",
      "title": string — one short line,
      "evidence": string — must cite actual numbers from the snapshot,
      "diagnosis": string — what is causing this and why it matters
    }
  ],
  "recommendations": [
    {
      "priority": number — 1 is highest, ascending with no gaps or ties,
      "action": string — a specific, executable instruction, not a theme,
      "rationale": string — why this, grounded in a finding,
      "expected_impact": string — the realistic outcome, with a magnitude where defensible,
      "effort": "low" | "med" | "high",
      "watch_metric": string — the single metric that confirms it worked
    }
  ]
}

Use severity "critical" for things actively losing money or corrupting decisions, "warning" for real problems that are not urgent, "opportunity" for upside that is not currently a problem, and "info" for context worth recording. Produce between 4 and 10 findings and between 3 and 8 recommendations. Prefer fewer, better-supported items over padding.`

/** Strip markdown fences and any stray prose around the object, then parse.
 *  Models occasionally wrap JSON in ```json despite instructions, and a brief
 *  is too expensive to discard over a fence. */
function parseBrief(text: string): Brief | null {
  const attempts: string[] = []
  const trimmed = text.trim()
  attempts.push(trimmed)
  attempts.push(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
  // Last resort: the outermost braces, for a response with a preamble.
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1))

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as Brief
      // Shape check: a parsed object that isn't a brief is a parse failure, not
      // a success — storing it would render an empty panel with no explanation.
      if (
        parsed && typeof parsed.summary === 'string' &&
        Array.isArray(parsed.findings) && Array.isArray(parsed.recommendations)
      ) {
        return parsed
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

/** Normalise what the model returned so the UI can render it without guarding
 *  every field. Unknown severities/efforts are coerced to safe defaults rather
 *  than crashing a render or showing an unstyled badge. */
function normalise(brief: Brief): Brief {
  const sev: Severity[] = ['critical', 'warning', 'opportunity', 'info']
  const areas: Area[] = ['ads', 'seo', 'analytics', 'measurement']
  const efforts: Effort[] = ['low', 'med', 'high']
  const order: Record<Severity, number> = { critical: 0, warning: 1, opportunity: 2, info: 3 }

  return {
    summary: String(brief.summary ?? ''),
    findings: (brief.findings ?? [])
      .map(f => ({
        severity: sev.includes(f?.severity) ? f.severity : 'info',
        area: areas.includes(f?.area) ? f.area : 'analytics',
        title: String(f?.title ?? ''),
        evidence: String(f?.evidence ?? ''),
        diagnosis: String(f?.diagnosis ?? ''),
      }))
      .sort((a, b) => order[a.severity] - order[b.severity]),
    recommendations: (brief.recommendations ?? [])
      .map((r, i) => ({
        priority: Number.isFinite(r?.priority) ? Number(r.priority) : i + 1,
        action: String(r?.action ?? ''),
        rationale: String(r?.rationale ?? ''),
        expected_impact: String(r?.expected_impact ?? ''),
        effort: efforts.includes(r?.effort) ? r.effort : 'med',
        watch_metric: String(r?.watch_metric ?? ''),
      }))
      .sort((a, b) => a.priority - b.priority),
  }
}

interface MessagesResponse {
  content?: { type: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  stop_reason?: string
  error?: { type?: string; message?: string }
}

/**
 * Send the snapshot to Claude and return a structured brief.
 *
 * A parse failure is a recorded outcome, not an exception: the raw text is
 * returned with status 'parse_error' so the run is stored and inspectable
 * rather than lost. Only a transport/API failure throws.
 */
export async function analyzeSnapshot(snapshot: AnalystSnapshot): Promise<AnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const started = Date.now()
  const userContent =
    'Analyse the following marketing snapshot and produce the JSON brief.\n\n' +
    '```json\n' + JSON.stringify(snapshot, null, 1) + '\n```'

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANALYST_MODEL,
      max_tokens: 16000,
      // Adaptive thinking: this is a genuine reasoning task, and on this model
      // it is the only supported on-mode (budget_tokens and the sampling
      // parameters are rejected outright).
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
    cache: 'no-store',
  })

  const raw = await res.text()
  if (!res.ok) {
    // Log the whole body — the Anthropic error JSON names the offending
    // parameter, which is the difference between a fix and a guess.
    console.error(`[analyst] Messages API HTTP ${res.status} — raw body follows:\n${raw}`)
    let parsed: MessagesResponse | null = null
    try { parsed = JSON.parse(raw) as MessagesResponse } catch { /* HTML or empty */ }
    throw new Error(
      parsed?.error?.message || `Anthropic API returned HTTP ${res.status}: ${raw.slice(0, 400)}`,
    )
  }

  const json = JSON.parse(raw) as MessagesResponse
  // Thinking blocks arrive alongside the answer (with empty text under the
  // default display setting), so select the text blocks rather than index [0].
  const text = (json.content ?? [])
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text as string)
    .join('')
    .trim()

  const inputTokens = json.usage?.input_tokens ?? 0
  const outputTokens = json.usage?.output_tokens ?? 0
  const usage: Usage = {
    inputTokens,
    outputTokens,
    estimatedCostUsd:
      (inputTokens / 1_000_000) * PRICE_PER_MTOK.input +
      (outputTokens / 1_000_000) * PRICE_PER_MTOK.output,
  }

  // The full raw response is logged server-side regardless of outcome — it is
  // the only record of what the model actually said if parsing goes wrong.
  console.log(
    `[analyst] model=${ANALYST_MODEL} stop=${json.stop_reason} ` +
    `in=${inputTokens} out=${outputTokens} ms=${Date.now() - started}\n` +
    `[analyst] raw response follows:\n${text}`,
  )

  if (json.stop_reason === 'max_tokens') {
    console.warn('[analyst] response hit max_tokens — the brief is probably truncated JSON')
  }

  const parsedBrief = parseBrief(text)
  return {
    status: parsedBrief ? 'ok' : 'parse_error',
    brief: parsedBrief ? normalise(parsedBrief) : null,
    rawResponse: text,
    model: ANALYST_MODEL,
    usage,
    runMs: Date.now() - started,
  }
}
