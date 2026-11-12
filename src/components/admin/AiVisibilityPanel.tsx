'use client'
// Admin → AI Visibility: do AI assistants (ChatGPT, Gemini, Perplexity, Claude)
// mention DealerAddendums when dealers ask our target questions?
//
// Renders what /api/ai-visibility/data computes server-side: scorecard with
// week-over-week deltas, trend chart (inline SVG), the prompt × engine grid
// ("we lose, competitor wins" first), competitor citation table, gaps panel
// (→ Blog pipeline), the Run now button, the prompt/competitor manager, and
// the one-click Site readiness report.

import { useCallback, useEffect, useRef, useState } from 'react'

const C = {
  navy: '#2a2b3c',
  orange: '#ffa500',
  blue: '#1976d2',
  success: '#4caf50',
  error: '#ff5252',
  warning: '#ff9800',
  bgSurface: '#ffffff',
  bgSubtle: '#f5f6f7',
  textPrimary: '#333333',
  textSecondary: '#55595c',
  textMuted: '#78828c',
  border: '#e0e0e0',
}

const ENGINE_META: Record<string, { label: string; color: string }> = {
  openai:     { label: 'ChatGPT',    color: '#10a37f' },
  gemini:     { label: 'Gemini',     color: '#4285f4' },
  perplexity: { label: 'Perplexity', color: '#20808d' },
  anthropic:  { label: 'Claude',     color: '#d97757' },
}
const ENGINE_IDS = ['openai', 'gemini', 'perplexity', 'anthropic']

const CATEGORIES = ['addendums', 'compliance', 'buyers_guide', 'pricing', 'competitors']

// ── Minimal local primitives (match marketing-dashboard.jsx) ─────────────────
const Card = ({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 24, ...style }}>
    {children}
  </div>
)

const SectionTitle = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    borderBottom: `1px solid ${C.border}`, paddingBottom: 12, marginBottom: 16,
  }}>
    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.textPrimary }}>{children}</h2>
    {action && <div style={{ flexShrink: 0 }}>{action}</div>}
  </div>
)

const SmallButton = ({ children, onClick, variant = 'secondary', disabled = false, title }: {
  children: React.ReactNode; onClick?: () => void; variant?: string; disabled?: boolean; title?: string
}) => {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    primary:   { bg: C.blue, color: '#fff', border: C.blue },
    secondary: { bg: C.bgSurface, color: C.textPrimary, border: C.border },
    success:   { bg: C.success, color: '#fff', border: C.success },
    danger:    { bg: C.error, color: '#fff', border: C.error },
  }
  const s = styles[variant] || styles.secondary
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      height: 28, padding: '0 10px', fontSize: 12,
      background: disabled ? C.bgSubtle : s.bg,
      color: disabled ? C.textMuted : s.color,
      border: `1px solid ${disabled ? C.border : s.border}`,
      borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'Roboto, sans-serif',
    }}>{children}</button>
  )
}

const inputStyle: React.CSSProperties = {
  height: 30, border: `1px solid ${C.border}`, borderRadius: 4, padding: '0 8px',
  fontSize: 13, fontFamily: "'Roboto', sans-serif", color: C.textPrimary,
  background: C.bgSurface, outline: 'none', boxSizing: 'border-box',
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textMuted,
  textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 10px',
  borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  fontSize: 13, color: C.textPrimary, padding: '8px 10px',
  borderBottom: `1px solid ${C.border}`, verticalAlign: 'top',
}

const Delta = ({ now, prev, suffix = 'pt' }: { now: number | null; prev: number | null; suffix?: string }) => {
  if (now === null || prev === null) return <span style={{ fontSize: 11, color: C.textMuted }}>—</span>
  const d = Math.round((now - prev) * 10) / 10
  if (d === 0) return <span style={{ fontSize: 11, color: C.textMuted }}>→ 0</span>
  const up = d > 0
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: up ? '#2e7d32' : '#c62828' }}>
      {up ? '▲' : '▼'} {Math.abs(d)}{suffix}
    </span>
  )
}

// ── Types from the API (loose on purpose — the server computes) ──────────────
type AnyObj = Record<string, any>

export default function AiVisibilityPanel() {
  const [data, setData] = useState<AnyObj | null>(null)
  const [loadError, setLoadError] = useState('')
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState('')
  const [openCell, setOpenCell] = useState<AnyObj | null>(null) // raw-answer viewer
  const [siteCheck, setSiteCheck] = useState<AnyObj | null>(null)
  const [siteChecking, setSiteChecking] = useState(false)
  const [sendingGap, setSendingGap] = useState('')
  const [gapMsg, setGapMsg] = useState<AnyObj>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-visibility/data')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(json.error || `HTTP ${res.status}`); return }
      setLoadError('')
      setData(json)
      const inFlight = !!json.running
      setRunning(inFlight)
      if (!inFlight && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    } catch {
      setLoadError('Network error loading AI Visibility data')
    }
  }, [])

  useEffect(() => {
    load()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(load, 15000)
  }

  const runNow = async () => {
    setRunMsg('')
    const res = await fetch('/api/ai-visibility/run', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setRunMsg(json.error || `HTTP ${res.status}`); return }
    setRunning(true)
    setRunMsg(`Run started — ${json.jobs} engine calls (~$${json.estimatedCostUsd}). Results appear here when it finishes (a few minutes).`)
    startPolling()
  }

  const openResult = async (resultId: string, promptText: string) => {
    if (!resultId) return
    setOpenCell({ loading: true, promptText })
    const res = await fetch(`/api/ai-visibility/result?id=${resultId}`)
    const json = await res.json().catch(() => ({}))
    setOpenCell(res.ok ? { ...json.result, promptText } : { error: json.error || 'Failed to load', promptText })
  }

  const sendGap = async (gap: AnyObj) => {
    setSendingGap(gap.prompt_id)
    const res = await fetch('/api/ai-visibility/gap-to-blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt_id: gap.prompt_id, engines: gap.enginesLost, competitors: gap.competitorsNamed,
      }),
    })
    const json = await res.json().catch(() => ({}))
    setGapMsg((m: AnyObj) => ({
      ...m,
      [gap.prompt_id]: res.ok ? `Draft created: ${json.slug}` : (json.error || 'Failed'),
    }))
    setSendingGap('')
  }

  const doSiteCheck = async () => {
    setSiteChecking(true)
    const res = await fetch('/api/ai-visibility/site-check')
    const json = await res.json().catch(() => ({}))
    setSiteCheck(res.ok ? json : { error: json.error || `HTTP ${res.status}` })
    setSiteChecking(false)
  }

  const manage = async (kind: string, action: string, id: string | null, fields: AnyObj) => {
    const res = await fetch('/api/ai-visibility/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, action, id, fields }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) alert(json.error || 'Save failed')
    await load()
  }

  if (loadError) {
    return (
      <Card>
        <SectionTitle>AI Visibility</SectionTitle>
        <p style={{ fontSize: 13, color: C.error, margin: 0 }}>{loadError}</p>
      </Card>
    )
  }
  if (!data) {
    return <Card><p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Loading AI Visibility…</p></Card>
  }

  const report: AnyObj = data.report || {}
  const latestRun: AnyObj | null = report.latestRun || null
  const scorecard: AnyObj[] = report.scorecard || []
  const trend: AnyObj[] = report.trend || []
  const grid: AnyObj[] = report.grid || []
  const competitors: AnyObj[] = report.competitors || []
  const gaps: AnyObj[] = report.gaps || []
  const engineKeys: AnyObj = data.engineKeys || {}
  const missingKeys = ENGINE_IDS.filter(e => !engineKeys[e])

  return (
    <div style={{ display: 'grid', gap: 20 }}>

      {/* ── Header: run control ── */}
      <Card>
        <SectionTitle action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {running && <span style={{ fontSize: 12, color: C.warning, fontWeight: 600 }}>Run in progress…</span>}
            <SmallButton variant="primary" onClick={runNow} disabled={running}>▶ Run now</SmallButton>
          </div>
        }>AI Visibility</SectionTitle>
        <p style={{ fontSize: 13, color: C.textSecondary, margin: '0 0 8px' }}>
          Asks {data.prompts?.filter((p: AnyObj) => p.active).length ?? 0} dealer questions on ChatGPT, Gemini,
          Perplexity and Claude (live web search on each) and records who gets mentioned and cited.
        </p>
        <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
          {latestRun
            ? <>Last run {new Date(latestRun.started_at).toLocaleString()} · status {latestRun.status} · cost ${Number(latestRun.cost_estimate_usd).toFixed(2)}</>
            : 'No runs yet — press Run now for the first audit.'}
          {missingKeys.length > 0 && (
            <span style={{ color: C.warning }}>
              {' '}· missing keys: {missingKeys.map(e => ENGINE_META[e].label).join(', ')} (those engines are skipped)
            </span>
          )}
        </p>
        {runMsg && <p style={{ fontSize: 12, color: C.textSecondary, margin: '8px 0 0' }}>{runMsg}</p>}
      </Card>

      {/* ── Scorecard ── */}
      {latestRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase' }}>Overall visibility</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.navy, margin: '6px 0 2px' }}>
              {report.overallPct === null ? '—' : `${report.overallPct}%`}
            </div>
            <Delta now={report.overallPct} prev={report.prevOverallPct} />
          </Card>
          {scorecard.map((s: AnyObj) => (
            <Card key={s.engine} style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: ENGINE_META[s.engine]?.color || C.textMuted, textTransform: 'uppercase' }}>
                {ENGINE_META[s.engine]?.label || s.engine}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.navy, margin: '6px 0 2px' }}>
                {s.pct === null ? '—' : `${s.pct}%`}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <Delta now={s.pct} prev={s.prevPct} />
                <span style={{ fontSize: 11, color: C.textMuted }}>{s.mentioned}/{s.asked} prompts</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Trend ── */}
      {trend.length >= 2 && (
        <Card>
          <SectionTitle>Visibility trend (last {trend.length} runs)</SectionTitle>
          <TrendChart trend={trend} />
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            {ENGINE_IDS.map(e => (
              <span key={e} style={{ fontSize: 12, color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ENGINE_META[e].color, display: 'inline-block' }} />
                {ENGINE_META[e].label}
              </span>
            ))}
            <span style={{ fontSize: 12, color: C.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: C.navy, display: 'inline-block' }} />
              Overall
            </span>
          </div>
        </Card>
      )}

      {/* ── Gaps ── */}
      {latestRun && (
        <Card>
          <SectionTitle>Gaps — competitors win, we&apos;re absent</SectionTitle>
          {gaps.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
              No gaps in the latest run (a gap = at least 2 engines named a competitor and not us).
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Prompt</th><th style={th}>Engines lost</th><th style={th}>Competitors named</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {gaps.map((g: AnyObj) => (
                  <tr key={g.prompt_id}>
                    <td style={td}>{g.prompt_text}
                      <span style={{ fontSize: 11, color: C.textMuted }}> · {g.category}</span></td>
                    <td style={td}>{g.enginesLost.map((e: string) => ENGINE_META[e]?.label || e).join(', ')}</td>
                    <td style={td}>{g.competitorsNamed.join(', ')}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {gapMsg[g.prompt_id]
                        ? <span style={{ fontSize: 12, color: C.success }}>{gapMsg[g.prompt_id]}</span>
                        : <SmallButton variant="primary" onClick={() => sendGap(g)} disabled={sendingGap === g.prompt_id}>
                            {sendingGap === g.prompt_id ? 'Sending…' : 'Send to Blog pipeline'}
                          </SmallButton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Prompt grid ── */}
      {latestRun && grid.length > 0 && (
        <Card>
          <SectionTitle>Prompt results — worst first</SectionTitle>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 10px' }}>
            ✓ = DealerAddendums mentioned · ✗ = not mentioned (red when a competitor was) · click a cell for the raw answer.
            ① = we were the first vendor named.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Prompt</th>
              {ENGINE_IDS.map(e => <th key={e} style={{ ...th, textAlign: 'center' }}>{ENGINE_META[e].label}</th>)}
            </tr></thead>
            <tbody>
              {grid.map((row: AnyObj) => (
                <tr key={row.prompt_id}>
                  <td style={td}>{row.prompt_text}
                    <span style={{ fontSize: 11, color: C.textMuted }}> · {row.category}</span></td>
                  {row.cells.map((cell: AnyObj) => {
                    const lost = !cell.error && !cell.da_mentioned && cell.competitors.length > 0
                    const label = cell.error ? '!' : cell.da_mentioned ? (cell.position_rank === 1 ? '✓①' : '✓') : '✗'
                    const color = cell.error ? C.warning : cell.da_mentioned ? '#2e7d32' : lost ? '#c62828' : C.textMuted
                    const tip = cell.error ? `Engine error: ${cell.error}`
                      : cell.competitors.length ? `Competitors: ${cell.competitors.join(', ')}` : 'Click for the raw answer'
                    return (
                      <td key={cell.engine} style={{ ...td, textAlign: 'center' }}>
                        <button onClick={() => openResult(cell.result_id, row.prompt_text)} title={tip} style={{
                          background: lost ? '#ffebee' : cell.da_mentioned ? '#e8f5e9' : C.bgSubtle,
                          color, border: `1px solid ${C.border}`, borderRadius: 4,
                          minWidth: 36, height: 26, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}>{label}</button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Raw answer viewer ── */}
      {openCell && (
        <Card style={{ border: `2px solid ${C.blue}` }}>
          <SectionTitle action={<SmallButton onClick={() => setOpenCell(null)}>Close</SmallButton>}>
            Raw answer — {openCell.promptText}
          </SectionTitle>
          {openCell.loading ? <p style={{ fontSize: 13, color: C.textMuted }}>Loading…</p>
            : openCell.error ? <p style={{ fontSize: 13, color: C.error }}>{openCell.error}</p>
            : (
              <div>
                <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 10px' }}>
                  {ENGINE_META[openCell.engine]?.label || openCell.engine} · {openCell.model}
                  {' '}· {openCell.latency_ms ? `${(openCell.latency_ms / 1000).toFixed(1)}s` : ''}
                  {' '}· ${Number(openCell.token_cost_usd || 0).toFixed(4)}
                  {openCell.competitors_mentioned?.length > 0 && <> · competitors: {openCell.competitors_mentioned.join(', ')}</>}
                  {openCell.da_cited_url && <> · cited us: {openCell.da_cited_url}</>}
                </p>
                <pre style={{
                  whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.55, color: C.textPrimary,
                  background: C.bgSubtle, border: `1px solid ${C.border}`, borderRadius: 4,
                  padding: 14, maxHeight: 420, overflow: 'auto', fontFamily: "'Roboto', sans-serif", margin: 0,
                }}>{openCell.raw_answer || '(empty answer)'}</pre>
                {openCell.cited_domains?.length > 0 && (
                  <p style={{ fontSize: 12, color: C.textSecondary, margin: '10px 0 0' }}>
                    Cited domains: {openCell.cited_domains.join(' · ')}
                  </p>
                )}
              </div>
            )}
        </Card>
      )}

      {/* ── Competitor citations ── */}
      {latestRun && (
        <Card>
          <SectionTitle>Competitor mentions (latest run)</SectionTitle>
          {competitors.length === 0
            ? <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>No competitor was mentioned in the latest run.</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Competitor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Mentions</th>
                  <th style={{ ...th, textAlign: 'right' }}>Δ vs prev run</th>
                  {ENGINE_IDS.map(e => <th key={e} style={{ ...th, textAlign: 'right' }}>{ENGINE_META[e].label}</th>)}
                </tr></thead>
                <tbody>
                  {competitors.map((c: AnyObj) => (
                    <tr key={c.name}>
                      <td style={td}>{c.name}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{c.total}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <Delta now={c.total} prev={c.prevTotal} suffix="" />
                      </td>
                      {ENGINE_IDS.map(e => (
                        <td key={e} style={{ ...td, textAlign: 'right', color: C.textSecondary }}>{c.byEngine[e] || 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Card>
      )}

      {/* ── Site readiness ── */}
      <Card>
        <SectionTitle action={
          <SmallButton variant="primary" onClick={doSiteCheck} disabled={siteChecking}>
            {siteChecking ? 'Checking…' : 'Check site readiness'}
          </SmallButton>
        }>Site readiness for AI crawlers</SectionTitle>
        <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
          Report only — checks robots.txt rules for GPTBot / Google-Extended / PerplexityBot / ClaudeBot / Bingbot,
          /llms.txt, and JSON-LD on the homepage and newest blog post. Any fixes are approved separately.
        </p>
        {siteCheck && (siteCheck.error ? (
          <p style={{ fontSize: 13, color: C.error, margin: '12px 0 0' }}>{siteCheck.error}</p>
        ) : (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 6 }}>
                robots.txt {siteCheck.robots.found ? '' : `— ${siteCheck.robots.error || 'not found'} (crawlers default to allowed)`}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(siteCheck.robots.bots || []).map((b: AnyObj) => (
                  <span key={b.bot} title={b.rules.join('\n') || 'no rules'} style={{
                    fontSize: 12, padding: '3px 10px', borderRadius: 12,
                    background: String(b.verdict).startsWith('allowed') ? '#e8f5e9' : String(b.verdict).startsWith('blocked') ? '#ffebee' : '#fff3e0',
                    color: String(b.verdict).startsWith('allowed') ? '#2e7d32' : String(b.verdict).startsWith('blocked') ? '#c62828' : '#e65100',
                    fontWeight: 600,
                  }}>{b.bot}: {b.verdict}</span>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.textPrimary }}>
              <strong>/llms.txt:</strong>{' '}
              <span style={{ color: siteCheck.llmsTxt.found ? '#2e7d32' : '#c62828' }}>
                {siteCheck.llmsTxt.found ? 'present' : 'missing'}
              </span>
              <span style={{ color: C.textMuted }}> — {siteCheck.llmsTxt.detail}</span>
            </div>
            <div style={{ fontSize: 13, color: C.textPrimary }}>
              <strong>Homepage JSON-LD:</strong>{' '}
              Organization <Flag ok={siteCheck.homepage.hasOrganization} /> ·
              SoftwareApplication <Flag ok={siteCheck.homepage.hasSoftwareApplication} />
              <span style={{ color: C.textMuted }}>
                {' '}({siteCheck.homepage.jsonLdTypes?.length ? `found: ${siteCheck.homepage.jsonLdTypes.join(', ')}` : siteCheck.homepage.error || 'no JSON-LD found'})
              </span>
            </div>
            <div style={{ fontSize: 13, color: C.textPrimary }}>
              <strong>Blog post JSON-LD{siteCheck.blogPost.slug ? ` (${siteCheck.blogPost.slug})` : ''}:</strong>{' '}
              Article <Flag ok={siteCheck.blogPost.hasArticle} /> ·
              FAQPage <Flag ok={siteCheck.blogPost.hasFaqPage} />
              <span style={{ color: C.textMuted }}>
                {' '}({siteCheck.blogPost.jsonLdTypes?.length ? `found: ${siteCheck.blogPost.jsonLdTypes.join(', ')}` : siteCheck.blogPost.error || 'no JSON-LD found'})
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>Checked {new Date(siteCheck.checkedAt).toLocaleString()} against {siteCheck.site}</div>
          </div>
        ))}
      </Card>

      {/* ── Prompt manager ── */}
      <PromptManager prompts={data.prompts || []} competitors={data.competitors || []} manage={manage} />
    </div>
  )
}

const Flag = ({ ok }: { ok: boolean }) => (
  <span style={{ fontWeight: 700, color: ok ? '#2e7d32' : '#c62828' }}>{ok ? '✓' : '✗'}</span>
)

// ── Inline SVG trend chart ────────────────────────────────────────────────────
function TrendChart({ trend }: { trend: AnyObj[] }) {
  const W = 920, H = 220, PAD = 36
  const n = trend.length
  const x = (i: number) => PAD + (n === 1 ? 0 : (i * (W - PAD * 2)) / (n - 1))
  const y = (pct: number) => H - PAD - (pct / 100) * (H - PAD * 2)
  // Overall draws FIRST (beneath) — it's thicker, and whenever a series equals
  // it exactly (a one-engine run makes overall == that engine) drawing it last
  // hid the engine line entirely. Engines get a tiny fixed y-offset (≤2px ≈
  // 0.5%) so engines that tie with EACH OTHER stay individually visible too.
  const series = [{
    color: C.navy, width: 2.5, dy: 0,
    points: trend.map((t, i) => ({ i, v: t.overall })),
  }].concat(ENGINE_IDS.map((e, idx) => ({
    color: ENGINE_META[e].color, width: 1.5, dy: (idx - 1.5) * 1.2,
    points: trend.map((t, i) => ({ i, v: t.perEngine?.[e] })),
  })))
  const path = (pts: { i: number; v: number | null }[], dy: number) => {
    let d = ''
    for (const p of pts) {
      if (p.v === null || p.v === undefined) continue
      d += `${d ? 'L' : 'M'}${x(p.i).toFixed(1)},${(y(p.v) + dy).toFixed(1)}`
    }
    return d
  }
  // An isolated point (both neighbors null) draws no path segment, so it needs
  // a clearly visible dot — e.g. an engine's first-ever run.
  const isolated = (pts: { v: number | null }[], i: number) => {
    const has = (j: number) => j >= 0 && j < pts.length && pts[j].v !== null && pts[j].v !== undefined
    return !has(i - 1) && !has(i + 1)
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {[0, 25, 50, 75, 100].map(g => (
        <g key={g}>
          <line x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke={C.border} strokeWidth="1" />
          <text x={PAD - 8} y={y(g) + 4} fontSize="10" fill={C.textMuted} textAnchor="end">{g}%</text>
        </g>
      ))}
      {trend.map((t, i) => (
        <text key={t.run_id} x={x(i)} y={H - PAD + 16} fontSize="9" fill={C.textMuted} textAnchor="middle">
          {new Date(t.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      ))}
      {series.map((s, idx) => (
        <g key={idx}>
          <path d={path(s.points, s.dy)} fill="none" stroke={s.color} strokeWidth={s.width} />
          {s.points.map((p, i) => (p.v === null || p.v === undefined) ? null : (
            <circle
              key={p.i} cx={x(p.i)} cy={y(p.v) + s.dy}
              r={isolated(s.points, i) ? s.width + 2.5 : s.width + 1} fill={s.color}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}

// ── Prompt & competitor manager ───────────────────────────────────────────────
function PromptManager({ prompts, competitors, manage }: {
  prompts: AnyObj[]; competitors: AnyObj[]
  manage: (kind: string, action: string, id: string | null, fields: AnyObj) => Promise<void>
}) {
  const [newPrompt, setNewPrompt] = useState('')
  const [newCategory, setNewCategory] = useState('addendums')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [newComp, setNewComp] = useState({ name: '', domains: '', aliases: '' })

  return (
    <Card>
      <SectionTitle>Prompt manager</SectionTitle>

      {/* Prompts */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <thead><tr><th style={th}>Prompt</th><th style={th}>Category</th><th style={th}>Status</th><th style={th}></th></tr></thead>
        <tbody>
          {prompts.map((p: AnyObj) => (
            <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
              <td style={td}>
                {editing === p.id
                  ? <input style={{ ...inputStyle, width: '100%' }} value={editText} onChange={e => setEditText(e.target.value)} />
                  : p.prompt_text}
              </td>
              <td style={td}>
                <select
                  value={p.category}
                  onChange={e => manage('prompt', 'update', p.id, { category: e.target.value })}
                  style={{ ...inputStyle, height: 28 }}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td style={td}>{p.active ? 'Active' : 'Off'}</td>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {editing === p.id ? (
                    <>
                      <SmallButton variant="success" onClick={async () => {
                        await manage('prompt', 'update', p.id, { prompt_text: editText }); setEditing(null)
                      }}>Save</SmallButton>
                      <SmallButton onClick={() => setEditing(null)}>Cancel</SmallButton>
                    </>
                  ) : (
                    <>
                      <SmallButton onClick={() => { setEditing(p.id); setEditText(p.prompt_text) }}>Edit</SmallButton>
                      <SmallButton onClick={() => manage('prompt', 'update', p.id, { active: !p.active })}>
                        {p.active ? 'Deactivate' : 'Activate'}
                      </SmallButton>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="New prompt — phrase it the way a dealer would ask"
          value={newPrompt} onChange={e => setNewPrompt(e.target.value)} />
        <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={inputStyle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <SmallButton variant="primary" disabled={!newPrompt.trim()} onClick={async () => {
          await manage('prompt', 'create', null, {
            prompt_text: newPrompt.trim(), category: newCategory,
            sort_order: (Math.max(0, ...prompts.map((p: AnyObj) => p.sort_order || 0)) + 10),
          })
          setNewPrompt('')
        }}>Add prompt</SmallButton>
      </div>

      {/* Competitors */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>Competitors the parser recognises</div>
        <p style={{ fontSize: 12, color: C.warning, margin: '0 0 10px' }}>
          ⚠ Seeded best-effort — review names/domains/aliases; matching is whole-word + domain.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Domains</th><th style={th}>Aliases</th><th style={th}>Status</th><th style={th}></th></tr></thead>
          <tbody>
            {competitors.map((c: AnyObj) => (
              <tr key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
                <td style={td}>{c.name}</td>
                <td style={{ ...td, color: C.textSecondary }}>{(c.domains || []).join(', ')}</td>
                <td style={{ ...td, color: C.textSecondary }}>{(c.aliases || []).join(', ')}</td>
                <td style={td}>{c.active ? 'Active' : 'Off'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <SmallButton onClick={() => manage('competitor', 'update', c.id, { active: !c.active })}>
                    {c.active ? 'Deactivate' : 'Activate'}
                  </SmallButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Name"
            value={newComp.name} onChange={e => setNewComp({ ...newComp, name: e.target.value })} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Domains (comma-separated)"
            value={newComp.domains} onChange={e => setNewComp({ ...newComp, domains: e.target.value })} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Aliases (comma-separated)"
            value={newComp.aliases} onChange={e => setNewComp({ ...newComp, aliases: e.target.value })} />
          <SmallButton variant="primary" disabled={!newComp.name.trim()} onClick={async () => {
            await manage('competitor', 'create', null, {
              name: newComp.name.trim(),
              domains: newComp.domains.split(',').map(s => s.trim()).filter(Boolean),
              aliases: newComp.aliases.split(',').map(s => s.trim()).filter(Boolean),
            })
            setNewComp({ name: '', domains: '', aliases: '' })
          }}>Add competitor</SmallButton>
        </div>
      </div>
    </Card>
  )
}
