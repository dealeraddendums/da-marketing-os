// AI Visibility — persistence + report assembly.
//
// All reads/writes go through the service-role client (RLS has no policies on
// these tables, by design). Report shapes are computed here, server-side, so
// the admin tab and the Analyst snapshot share one definition of "visibility".

import { supabase } from '@/lib/supabase'
import type { CompetitorDef, EngineId, PromptDef } from './types'
import { ENGINES } from './types'

export interface RunRow {
  id: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'partial' | 'error'
  prompt_count: number
  cost_estimate_usd: number
  notes: string | null
}

export interface ResultRow {
  id: string
  run_id: string
  prompt_id: string
  engine: EngineId
  model: string
  raw_answer: string
  da_mentioned: boolean
  da_cited_url: string | null
  competitors_mentioned: string[]
  cited_domains: string[]
  position_rank: number | null
  latency_ms: number | null
  token_cost_usd: number | null
  error: string | null
}

const fail = (where: string, error: { message: string } | null) => {
  throw new Error(`[ai-visibility] ${where}: ${error?.message || 'unknown error'}`)
}

// ── Prompts & competitors ─────────────────────────────────────────────────────

export async function getPrompts(activeOnly = false): Promise<PromptDef[]> {
  let q = supabase.from('ai_visibility_prompts')
    .select('id, prompt_text, category, active, sort_order')
    .order('sort_order', { ascending: true })
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) fail('getPrompts', error)
  return (data || []) as PromptDef[]
}

export async function getCompetitors(activeOnly = false): Promise<CompetitorDef[]> {
  let q = supabase.from('ai_visibility_competitors')
    .select('id, name, domains, aliases, active')
    .order('name', { ascending: true })
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) fail('getCompetitors', error)
  return (data || []) as CompetitorDef[]
}

// ── Runs & results ────────────────────────────────────────────────────────────

export async function createRun(promptCount: number, costEstimate: number, notes: string): Promise<RunRow> {
  const { data, error } = await supabase.from('ai_visibility_runs')
    .insert({
      status: 'running',
      prompt_count: promptCount,
      cost_estimate_usd: Math.round(costEstimate * 10000) / 10000,
      notes,
    })
    .select()
    .single()
  if (error) fail('createRun', error)
  return data as RunRow
}

export async function finishRun(
  runId: string,
  status: 'ok' | 'partial' | 'error',
  actualCost: number,
  notes: string,
): Promise<void> {
  const { error } = await supabase.from('ai_visibility_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      cost_estimate_usd: Math.round(actualCost * 10000) / 10000,
      notes,
    })
    .eq('id', runId)
  if (error) fail('finishRun', error)
}

export async function getRunningRun(): Promise<RunRow | null> {
  // A 'running' row younger than 30 min means a run is genuinely in flight; an
  // older one is a crashed run (process restarted mid-run) and doesn't block.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const { data, error } = await supabase.from('ai_visibility_runs')
    .select('*')
    .eq('status', 'running')
    .gte('started_at', cutoff)
    .order('started_at', { ascending: false })
    .limit(1)
  if (error) fail('getRunningRun', error)
  return (data && data[0]) ? (data[0] as RunRow) : null
}

export async function insertResult(row: Omit<ResultRow, 'id'>): Promise<void> {
  const { error } = await supabase.from('ai_visibility_results').insert(row)
  if (error) fail('insertResult', error)
}

export async function getRuns(limit = 12): Promise<RunRow[]> {
  const { data, error } = await supabase.from('ai_visibility_runs')
    .select('*')
    .neq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) fail('getRuns', error)
  return (data || []) as RunRow[]
}

export async function getResultsForRun(runId: string): Promise<ResultRow[]> {
  const { data, error } = await supabase.from('ai_visibility_results')
    .select('*')
    .eq('run_id', runId)
  if (error) fail('getResultsForRun', error)
  return (data || []) as ResultRow[]
}

// ── Report shapes ─────────────────────────────────────────────────────────────

export interface EngineScore {
  engine: EngineId
  asked: number
  mentioned: number
  pct: number | null      // null when the engine didn't run (no key)
  prevPct: number | null  // previous run, for the delta arrow
}

export interface PromptCell {
  engine: EngineId
  da_mentioned: boolean
  da_cited_url: string | null
  competitors: string[]
  position_rank: number | null
  error: string | null
  result_id: string
}

export interface PromptGridRow {
  prompt_id: string
  prompt_text: string
  category: string
  cells: PromptCell[]
  /** engines where a competitor was named and DA was not — the sort key. */
  losses: number
}

export interface CompetitorScore {
  name: string
  total: number
  prevTotal: number
  byEngine: Record<string, number>
}

export interface Gap {
  prompt_id: string
  prompt_text: string
  category: string
  enginesLost: string[]
  competitorsNamed: string[]
}

export interface VisibilityReport {
  latestRun: RunRow | null
  previousRun: RunRow | null
  scorecard: EngineScore[]
  overallPct: number | null
  prevOverallPct: number | null
  trend: { run_id: string; started_at: string; perEngine: Record<string, number | null>; overall: number | null }[]
  grid: PromptGridRow[]
  competitors: CompetitorScore[]
  gaps: Gap[]
}

function pctOf(results: ResultRow[], engine?: EngineId): number | null {
  const rows = results.filter(r => !r.error && (!engine || r.engine === engine))
  if (!rows.length) return null
  const hit = rows.filter(r => r.da_mentioned).length
  return Math.round((hit / rows.length) * 1000) / 10
}

/** Everything the admin tab renders, computed from the stored runs. */
export async function buildReport(): Promise<VisibilityReport> {
  const runs = await getRuns(12)
  const latestRun = runs[0] || null
  const previousRun = runs[1] || null
  const prompts = await getPrompts()
  const promptById: Record<string, PromptDef> = {}
  for (const p of prompts) promptById[p.id] = p

  const latest = latestRun ? await getResultsForRun(latestRun.id) : []
  const previous = previousRun ? await getResultsForRun(previousRun.id) : []

  // Scorecard
  const scorecard: EngineScore[] = ENGINES.map(engine => {
    const rows = latest.filter(r => r.engine === engine && !r.error)
    const mentioned = rows.filter(r => r.da_mentioned).length
    return {
      engine,
      asked: rows.length,
      mentioned,
      pct: pctOf(latest, engine),
      prevPct: pctOf(previous, engine),
    }
  })

  // Trend across the stored runs (oldest → newest for the chart).
  const trend: VisibilityReport['trend'] = []
  for (const run of runs.slice().reverse()) {
    const rows = run.id === latestRun?.id ? latest
      : run.id === previousRun?.id ? previous
      : await getResultsForRun(run.id)
    const perEngine: Record<string, number | null> = {}
    for (const e of ENGINES) perEngine[e] = pctOf(rows, e)
    trend.push({ run_id: run.id, started_at: run.started_at, perEngine, overall: pctOf(rows) })
  }

  // Prompt grid (latest run), "we lose, competitor wins" first.
  const byPrompt: Record<string, ResultRow[]> = {}
  for (const r of latest) {
    if (!byPrompt[r.prompt_id]) byPrompt[r.prompt_id] = []
    byPrompt[r.prompt_id].push(r)
  }
  const grid: PromptGridRow[] = Object.keys(byPrompt).map(pid => {
    const rows = byPrompt[pid]
    const cells: PromptCell[] = ENGINES.map(engine => {
      const r = rows.find(x => x.engine === engine)
      return {
        engine,
        da_mentioned: !!r?.da_mentioned,
        da_cited_url: r?.da_cited_url || null,
        competitors: r?.competitors_mentioned || [],
        position_rank: r?.position_rank ?? null,
        error: r?.error || null,
        result_id: r?.id || '',
      }
    })
    const losses = cells.filter(c => !c.error && !c.da_mentioned && c.competitors.length > 0).length
    const p = promptById[pid]
    return {
      prompt_id: pid,
      prompt_text: p?.prompt_text || '(deleted prompt)',
      category: p?.category || '',
      cells,
      losses,
    }
  }).sort((a, b) => b.losses - a.losses ||
    (promptById[a.prompt_id]?.sort_order ?? 0) - (promptById[b.prompt_id]?.sort_order ?? 0))

  // Competitor citations
  const countCompetitors = (rows: ResultRow[]) => {
    const totals: Record<string, { total: number; byEngine: Record<string, number> }> = {}
    for (const r of rows) {
      for (const name of r.competitors_mentioned || []) {
        if (!totals[name]) totals[name] = { total: 0, byEngine: {} }
        totals[name].total += 1
        totals[name].byEngine[r.engine] = (totals[name].byEngine[r.engine] || 0) + 1
      }
    }
    return totals
  }
  const nowTotals = countCompetitors(latest)
  const prevTotals = countCompetitors(previous)
  const names = Object.keys(nowTotals)
  for (const n of Object.keys(prevTotals)) if (names.indexOf(n) === -1) names.push(n)
  const competitors: CompetitorScore[] = names.map(name => ({
    name,
    total: nowTotals[name]?.total || 0,
    prevTotal: prevTotals[name]?.total || 0,
    byEngine: nowTotals[name]?.byEngine || {},
  })).sort((a, b) => b.total - a.total)

  // Gaps: ≥2 engines named a competitor and not us (latest run).
  const gaps: Gap[] = grid
    .filter(row => row.losses >= 2)
    .map(row => {
      const lost = row.cells.filter(c => !c.error && !c.da_mentioned && c.competitors.length > 0)
      const named: string[] = []
      for (const c of lost) for (const n of c.competitors) if (named.indexOf(n) === -1) named.push(n)
      return {
        prompt_id: row.prompt_id,
        prompt_text: row.prompt_text,
        category: row.category,
        enginesLost: lost.map(c => c.engine),
        competitorsNamed: named,
      }
    })

  return {
    latestRun, previousRun, scorecard,
    overallPct: pctOf(latest),
    prevOverallPct: pctOf(previous),
    trend, grid, competitors, gaps,
  }
}

/** Compact summary for the Analyst snapshot — small on purpose (token budget). */
export async function visibilitySummaryForAnalyst(): Promise<{
  latestRunAt: string
  overallPct: number | null
  perEngine: Record<string, number | null>
  topGaps: { prompt: string; competitors: string[] }[]
  competitorsGaining: { name: string; mentions: number; delta: number }[]
} | null> {
  const report = await buildReport()
  if (!report.latestRun) return null
  return {
    latestRunAt: report.latestRun.started_at,
    overallPct: report.overallPct,
    perEngine: report.scorecard.reduce((acc, s) => {
      acc[s.engine] = s.pct
      return acc
    }, {} as Record<string, number | null>),
    topGaps: report.gaps.slice(0, 5).map(g => ({
      prompt: g.prompt_text, competitors: g.competitorsNamed,
    })),
    competitorsGaining: report.competitors
      .map(c => ({ name: c.name, mentions: c.total, delta: c.total - c.prevTotal }))
      .filter(c => c.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5),
  }
}
