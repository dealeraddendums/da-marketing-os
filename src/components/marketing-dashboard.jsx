import { useState, useEffect, useRef } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// ── DA Design System — exact values from DADesignGuidelines.md ────────────────
const C = {
  // Core
  navy:          "#2a2b3c",   // topbar, sidebar background
  orange:        "#ffa500",   // nav accent, active states
  blue:          "#1976d2",   // primary action buttons
  blueLight:     "#2196f3",   // secondary blue, hover, info badges
  // Feedback
  success:       "#4caf50",
  error:         "#ff5252",
  warning:       "#ff9800",
  // Backgrounds
  bgApp:         "#3a6897",   // main page background
  bgSurface:     "#ffffff",   // cards, panels, modals
  bgSubtle:      "#f5f6f7",   // alternating rows, input backgrounds
  // Text
  textPrimary:   "#333333",
  textSecondary: "#55595c",
  textMuted:     "#78828c",
  textInverse:   "#ffffff",
  // Borders
  border:        "#e0e0e0",
  borderStrong:  "#c0c0c0",
};

// ── Badge color maps per DA spec ──────────────────────────────────────────────
const BADGE = {
  success: { bg: "#e8f5e9", text: "#2e7d32" },
  error:   { bg: "#ffebee", text: "#c62828" },
  info:    { bg: "#e3f2fd", text: "#1565c0" },
  warning: { bg: "#fff3e0", text: "#e65100" },
  neutral: { bg: "#f5f6f7", text: "#55595c" },
};

// ── Mock data ─────────────────────────────────────────────────────────────────
// ── UI Primitives ─────────────────────────────────────────────────────────────

const Badge = ({ children, variant = "neutral" }) => {
  const { bg, text } = BADGE[variant] || BADGE.neutral;
  return (
    <span style={{
      display: "inline-block",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 8px",
      background: bg,
      color: text,
    }}>{children}</span>
  );
};

const statusVariant = (status) => ({
  running:   "success",
  published: "success",
  scheduled: "info",
  draft:     "warning",
  paused:    "neutral",
}[status] || "neutral");

const statusLabel = (status) => ({
  running:   "Running",
  published: "Published",
  scheduled: "Scheduled",
  draft:     "Draft",
  paused:    "Paused",
}[status] || status);

// Card: white bg, 1px #e0e0e0 border, 6px radius, NO box-shadow
const Card = ({ children, style = {} }) => (
  <div style={{
    background: C.bgSurface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: 24,
    ...style,
  }}>{children}</div>
);

// Section header: 16px weight 600, border-bottom, padding-bottom 12
const SectionTitle = ({ children, action }) => (
  <div style={{
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderBottom: `1px solid ${C.border}`, paddingBottom: 12, marginBottom: 16,
  }}>
    <h2 style={{
      margin: 0, fontSize: 16, fontWeight: 600, color: C.textPrimary,
    }}>{children}</h2>
    {action}
  </div>
);

// Progress bar — flat, no rounded pill ends
const MiniBar = ({ pct, color = C.blue, height = 6 }) => (
  <div style={{ background: C.bgSubtle, borderRadius: 3, height, overflow: "hidden" }}>
    <div style={{
      width: `${Math.min(pct, 100)}%`, height: "100%",
      background: color, borderRadius: 3,
      transition: "width 0.4s ease",
    }} />
  </div>
);

const PlatformIcon = ({ platform }) => {
  const map = {
    LinkedIn: { label: "in", color: "#0077b5" },
    Twitter:  { label: "𝕏",  color: "#1da1f2" },
    Facebook: { label: "f",  color: "#1877f2" },
  };
  const { label, color } = map[platform] || { label: "?", color: C.textMuted };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 24, height: 24, borderRadius: 4,
      fontSize: 11, fontWeight: 700,
      background: C.bgSubtle,
      color: color,
      border: `1px solid ${C.border}`,
      flexShrink: 0,
    }}>{label}</span>
  );
};

// Small action button (height 28px per table row spec)
const SmallButton = ({ children, onClick, variant = "secondary", disabled = false }) => {
  const styles = {
    primary:   { bg: C.blue,    color: "#fff", border: C.blue    },
    secondary: { bg: C.bgSurface, color: C.textPrimary, border: C.border },
    success:   { bg: C.success, color: "#fff", border: C.success },
    danger:    { bg: C.error,   color: "#fff", border: C.error   },
  };
  const s = styles[variant] || styles.secondary;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      height: 28, padding: "0 10px", fontSize: 12,
      background: disabled ? C.bgSubtle : s.bg,
      color: disabled ? C.textMuted : s.color,
      border: `1px solid ${disabled ? C.border : s.border}`,
      borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      fontFamily: "Roboto, sans-serif",
    }}>{children}</button>
  );
};

// Standard button (height 36px)
const Button = ({ children, onClick, variant = "primary", disabled = false, loading = false }) => {
  const styles = {
    primary:   { bg: C.blue,    color: "#fff",         border: C.blue    },
    success:   { bg: C.success, color: "#fff",         border: C.success },
    danger:    { bg: C.error,   color: "#fff",         border: C.error   },
    secondary: { bg: C.bgSurface, color: C.textPrimary, border: C.border },
  };
  const s = styles[variant] || styles.primary;
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      height: 36, padding: "0 16px", fontSize: 14,
      background: (disabled || loading) ? C.bgSubtle : s.bg,
      color: (disabled || loading) ? C.textMuted : s.color,
      border: `1px solid ${(disabled || loading) ? C.border : s.border}`,
      borderRadius: 4, cursor: (disabled || loading) ? "not-allowed" : "pointer",
      opacity: (disabled || loading) ? 0.5 : 1,
      fontFamily: "Roboto, sans-serif", fontWeight: 500,
    }}>{loading ? "Loading…" : children}</button>
  );
};

// ── Input / Select styled per DA spec ─────────────────────────────────────────
const inputStyle = {
  height: 36, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: "0 12px", fontSize: 14, fontFamily: "Roboto, sans-serif",
  color: C.textPrimary, background: C.bgSurface, width: "100%", boxSizing: "border-box",
};

// ── AI Copy Generator ─────────────────────────────────────────────────────────
function CopyGenerator() {
  const [section,  setSection]  = useState("hero");
  const [audience, setAudience] = useState("franchise dealers");
  const [goal,     setGoal]     = useState("increase free trial signups");
  const [loading,  setLoading]  = useState(false);
  const [variants, setVariants] = useState(null);
  const [error,    setError]    = useState(null);

  const generate = async () => {
    setLoading(true); setVariants(null); setError(null);
    try {
      const res = await fetch("/api/ai-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, audience, goal }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVariants(data.variants);
    } catch (e) {
      setError(`Generation failed — ${e.message || "check API connection."}`);
    }
    setLoading(false);
  };

  return (
    <Card>
      <SectionTitle>AI Copy Generator</SectionTitle>

      {/* Form row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {[
          ["Section", section, setSection,
            ["hero","features","pricing","cta","testimonials"]],
          ["Audience", audience, setAudience,
            ["franchise dealers","used car dealers","single-point dealer","Kia dealers","Ford dealers"]],
          ["Goal", goal, setGoal,
            ["increase free trial signups","improve trust","reduce bounce","emphasize compliance"]],
        ].map(([label, val, setter, opts]) => (
          <div key={label}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: C.textSecondary, marginBottom: 6 }}>
              {label}
            </label>
            <select value={val} onChange={e => setter(e.target.value)} style={{ ...inputStyle }}>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>

      <Button onClick={generate} loading={loading} variant="primary">Generate Variants</Button>

      {error && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.error }}>{error}</div>
      )}

      {variants && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 20 }}>
          {variants.map((v, i) => (
            <div key={i} style={{
              background: C.bgSubtle, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Badge variant="info">{v.variant}</Badge>
                <SmallButton variant="primary">Use this</SmallButton>
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3, marginBottom: 6 }}>
                {v.headline}
              </div>
              <div style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5, marginBottom: 8 }}>
                {v.subheadline}
              </div>
              <div style={{
                fontSize: 12, color: C.textMuted, fontStyle: "italic",
                borderTop: `1px solid ${C.border}`, paddingTop: 8,
              }}>
                {v.reasoning}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Blog Generator ────────────────────────────────────────────────────────────
function BlogGenerator() {
  const [topic,          setTopic]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [generatingFull, setGeneratingFull] = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [scheduling,     setScheduling]     = useState(false);
  const [result,         setResult]         = useState(null);
  const [fullMdx,        setFullMdx]        = useState(null);
  const [saveMsg,        setSaveMsg]        = useState(null);
  const [error,          setError]          = useState(null);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true); setResult(null); setFullMdx(null); setSaveMsg(null); setError(null);
    try {
      const res = await fetch("/api/blog-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, mode: "outline" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(`Generation failed — ${e.message || "check API connection."}`);
    }
    setLoading(false);
  };

  const writeFull = async () => {
    if (!result) return;
    setGeneratingFull(true); setFullMdx(null); setSaveMsg(null); setError(null);
    try {
      const res = await fetch("/api/blog-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: result.title || topic, mode: "full", keywords: result.keywords || [] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFullMdx(data);
    } catch (e) {
      setError(`Full post generation failed — ${e.message}`);
    }
    setGeneratingFull(false);
  };

  const addToQueue = async () => {
    if (!fullMdx) return;
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch("/api/blog-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: fullMdx.slug, mdx: fullMdx.mdx }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSaveMsg(`Saved → ${data.url}`);
    } catch (e) {
      setError(`Save failed — ${e.message}`);
    }
    setSaving(false);
  };

  const scheduleSocial = async () => {
    if (!fullMdx) return;
    setScheduling(true);
    try {
      const res = await fetch("/api/social-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fullMdx.title,
          slug: fullMdx.slug,
          excerpt: result?.metaDescription || "",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSaveMsg(`Social posts scheduled for ${data.posts?.length || 3} platforms.`);
    } catch (e) {
      setError(`Social scheduling failed — ${e.message}`);
    }
    setScheduling(false);
  };

  return (
    <Card>
      <SectionTitle>AI Blog Generator</SectionTitle>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === "Enter" && generate()}
          placeholder="e.g. How car dealers can reduce compliance risk in 2026"
          style={{ ...inputStyle, flex: 1 }}
        />
        <Button onClick={generate} loading={loading} disabled={!topic.trim()}>
          Generate Outline
        </Button>
      </div>

      {error && <div style={{ fontSize: 12, color: C.error, marginBottom: 8 }}>{error}</div>}
      {saveMsg && <div style={{ fontSize: 12, color: C.success, marginBottom: 8 }}>✓ {saveMsg}</div>}

      {result && (
        <div>
          {/* Outline preview */}
          <div style={{
            background: C.bgSubtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: 16, marginBottom: 12,
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>
              {result.title}
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 10 }}>
              {result.metaDescription}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Badge variant="info">{result.estimatedReadTime}</Badge>
              {(result.keywords || []).map(k => <Badge key={k} variant="neutral">{k}</Badge>)}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              {(result.outline || []).map((s, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.blue, marginBottom: 2 }}>
                    {i + 1}. {s.heading}
                  </div>
                  <div style={{ fontSize: 13, color: C.textSecondary }}>{s.summary}</div>
                </div>
              ))}
            </div>
            <div style={{
              borderTop: `1px solid ${C.border}`, paddingTop: 10,
              fontSize: 13, color: C.success, fontStyle: "italic",
            }}>
              {result.cta}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: fullMdx ? 16 : 0 }}>
            <SmallButton variant="primary" onClick={writeFull} disabled={generatingFull}>
              {generatingFull ? "Writing…" : "Write Full Post"}
            </SmallButton>
            <SmallButton
              variant="secondary"
              onClick={addToQueue}
              disabled={!fullMdx || saving}
            >
              {saving ? "Saving…" : "Add to Queue"}
            </SmallButton>
            <SmallButton
              variant="secondary"
              onClick={scheduleSocial}
              disabled={!fullMdx || scheduling}
            >
              {scheduling ? "Scheduling…" : "Generate Social Posts"}
            </SmallButton>
          </div>

          {/* Full MDX preview */}
          {fullMdx && (
            <div>
              <div style={{
                fontSize: 12, fontWeight: 700, color: C.textMuted,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 6,
              }}>
                Full Post Preview — {fullMdx.slug}.mdx
              </div>
              <textarea
                readOnly
                value={fullMdx.mdx}
                rows={18}
                style={{
                  ...inputStyle,
                  height: "auto",
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: 12,
                  lineHeight: 1.6,
                  padding: "12px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  color: C.textPrimary,
                  background: "#fafafa",
                }}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── New Experiment Modal ──────────────────────────────────────────────────────
function NewExperimentModal({ onClose }) {
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    // Record experiment start as a synthetic event in ab_events so the
    // ab-data route can anchor "started" dates. Full experiment CRUD is Phase 3.
    await fetch("/api/ab-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "experiment_start",
        abVariant: "new",
        utmTerm: `exp:${name.trim()}`,
        headline: hypothesis,
        aiGenerated: false,
      }),
    }).catch(() => {});
    setSaving(false);
    onClose(name.trim());
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.bgSurface, borderRadius: 6,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        width: 480, padding: 28,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.textPrimary }}>New Experiment</h2>
          <button onClick={() => onClose(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.textMuted }}>×</button>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: C.textSecondary, marginBottom: 6 }}>
              Experiment Name <span style={{ color: C.error }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. CTA button color — blue vs green"
              style={{ ...inputStyle }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: C.textSecondary, marginBottom: 6 }}>
              Hypothesis
            </label>
            <input
              value={hypothesis}
              onChange={e => setHypothesis(e.target.value)}
              placeholder="e.g. Green CTA will increase trial signups by 15%"
              style={{ ...inputStyle }}
            />
          </div>
          <div style={{ background: C.bgSubtle, borderRadius: 6, padding: "10px 14px", fontSize: 13, color: C.textMuted }}>
            Variants are tracked automatically via the <code>da_hero_ab</code> cookie (generic / personalized / dealertype). Custom variant tracking is available in Phase 3.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
          <Button variant="secondary" onClick={() => onClose(null)}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!name.trim()}>
            Start Experiment
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── A/B Experiments ───────────────────────────────────────────────────────────
function ABPanel() {
  const [liveExperiments, setLiveExperiments] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    fetch("/api/ab-data")
      .then(r => r.json())
      .then(data => {
        if (data.live && data.experiments?.length) setLiveExperiments(data.experiments);
        setLiveLoading(false);
      })
      .catch(() => setLiveLoading(false));
  }, []);

  const experiments = liveExperiments || [];
  const isLive = !!liveExperiments;

  const handleNewExperiment = (name) => {
    setShowModal(false);
    if (name) {
      setToastMsg(`Experiment "${name}" started — tracking via hero variant cookie.`);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  return (
    <>
      {showModal && <NewExperimentModal onClose={handleNewExperiment} />}

      <Card>
        <SectionTitle
          action={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {isLive
                ? <Badge variant="success">Live Data</Badge>
                : liveLoading
                  ? <Badge variant="neutral">Loading…</Badge>
                  : <Badge variant="neutral">No data yet</Badge>
              }
              <SmallButton variant="primary" onClick={() => setShowModal(true)}>+ New Experiment</SmallButton>
            </div>
          }
        >A/B Experiments</SectionTitle>

        {toastMsg && (
          <div style={{
            marginBottom: 12, padding: "10px 14px", borderRadius: 6,
            background: "#e8f5e9", border: "1px solid #c8e6c9",
            fontSize: 13, color: "#2e7d32",
          }}>{toastMsg}</div>
        )}

        {experiments.length === 0 && !liveLoading && (
          <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0", textAlign: "center" }}>
            No A/B experiments yet. The hero copy test (generic / personalized / dealertype) runs via
            cookie; results appear here once enough traffic is tracked.
          </div>
        )}
        <div style={{ display: "grid", gap: 16 }}>
          {experiments.map(exp => (
            <div key={exp.id} style={{
              background: C.bgSubtle, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: C.textPrimary }}>{exp.name}</span>
                  <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 10 }}>started {exp.started}</span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{
                    fontSize: 12,
                    color: exp.significance >= 95 ? C.success
                         : exp.significance >= 70 ? C.warning
                         : C.textMuted,
                  }}>
                    {exp.significance}% confidence
                  </span>
                  <Badge variant={statusVariant(exp.status)}>{statusLabel(exp.status)}</Badge>
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${exp.variants.length}, 1fr)`,
                gap: 10,
              }}>
                {exp.variants.map((v, i) => (
                  <div key={i} style={{
                    padding: 12, borderRadius: 6,
                    background: C.bgSurface,
                    border: exp.winner === v.name
                      ? `2px solid ${C.blue}`
                      : `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>{v.name}</span>
                      {exp.winner === v.name && <Badge variant="info">Winner</Badge>}
                    </div>
                    <div style={{
                      fontSize: 24, fontWeight: 600,
                      color: exp.winner === v.name ? C.blue : C.textPrimary,
                      marginBottom: 6,
                    }}>
                      {v.rate}%
                    </div>
                    <MiniBar
                      pct={(v.rate / 6) * 100}
                      color={exp.winner === v.name ? C.blue : C.blueLight}
                    />
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                      {v.conversions} / {v.visitors.toLocaleString()} visitors
                    </div>
                  </div>
                ))}
              </div>

              {exp.winner && exp.significance >= 90 && (
                <div style={{
                  marginTop: 12, padding: "10px 14px", borderRadius: 6,
                  background: "#e8f5e9", border: `1px solid #c8e6c9`,
                  fontSize: 13, color: "#2e7d32",
                }}>
                  Recommendation: Deploy "{exp.winner}" as new control — {exp.significance}% statistical confidence reached.
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────
// Honest funnel: only Visitors + Trial Signup have an event source today.
// Engaged / Pricing Viewed / Form Started need dedicated PostHog events (not
// wired yet) and render as "not tracked yet" — never invented numbers.
// Converted (trial→paid) lives in da-billing, not the marketing Supabase.
function FunnelPanel({ ga4 = null }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);
  // Two sources measure this funnel and they will NOT agree: first-party
  // ab_events fire only on the homepage and /lp pages, while GA4 counts
  // sessions across the whole site. Rather than silently pick one, show which
  // is on screen and let it be switched.
  const [source, setSource] = useState(ga4 ? "ga4" : "first-party");

  useEffect(() => {
    fetch("/api/funnel")
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Could not load funnel"));
  }, []);

  const useGa4 = source === "ga4" && !!ga4;

  const visitors = useGa4 ? (ga4.sessions ?? 0)      : (data?.visitors ?? 0);
  const engaged  = useGa4 ? (ga4.engaged ?? 0)       : (data?.engaged ?? 0);
  const pricing  = useGa4 ? (ga4.pricingViews ?? 0)  : (data?.pricingViewed ?? 0);
  const formed   = useGa4 ? null                     : (data?.formStarted ?? 0);
  const trials   = useGa4 ? (ga4.signups ?? 0)       : (data?.trialSignups ?? 0);
  const converted = data?.converted ?? 0;
  const pct = (n) => (visitors > 0 ? Math.round((n / visitors) * 1000) / 10 : 0);

  // tracked: live number + bar. untracked: greyed, no bar, no number.
  const steps = [
    { label: useGa4 ? "Sessions" : "Visitors",
                                       tracked: true,  value: visitors,  pct: 100,            color: C.blue },
    { label: useGa4 ? "Engaged sessions" : "Engaged (30s+)",
                                       tracked: true,  value: engaged,   pct: pct(engaged),   color: C.blueLight },
    { label: useGa4 ? "Pricing pageviews" : "Pricing Viewed",
                                       tracked: true,  value: pricing,   pct: pct(pricing),   color: C.blueLight },
    // GA4 has no first-party "form_start" event configured, so this step is
    // greyed rather than shown as a real zero when GA4 is the source.
    { label: "Form Started",           tracked: !useGa4, value: formed,   pct: pct(formed ?? 0), color: C.blueLight },
    { label: "Trial Signup",           tracked: true,  value: trials,    pct: pct(trials),    color: C.success },
    { label: "Converted (trial→paid)", tracked: true,  value: converted, pct: pct(converted), color: C.success },
  ];

  return (
    <Card>
      <SectionTitle action={ga4 ? (
        <div style={{ display: "flex", gap: 6 }}>
          {[["ga4", "GA4"], ["first-party", "First-party"]].map(([id, label]) => (
            <button key={id} onClick={() => setSource(id)} style={{
              height: 28, padding: "0 10px", fontSize: 12,
              background: source === id ? C.blue : C.bgSurface,
              color: source === id ? "#fff" : C.textPrimary,
              border: `1px solid ${source === id ? C.blue : C.border}`,
              borderRadius: 4, cursor: "pointer", fontFamily: "Roboto, sans-serif",
            }}>{label}</button>
          ))}
        </div>
      ) : null}>
        Conversion Funnel — Last 30 Days
      </SectionTitle>
      {error && !useGa4 ? (
        <div style={{ fontSize: 13, color: C.error }}>Could not load funnel — {error}</div>
      ) : (!data && !useGa4) ? (
        <div style={{ fontSize: 13, color: C.textMuted }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 10 }}>
            {steps.map((step, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, color: step.tracked ? C.textPrimary : C.textMuted }}>
                    {step.label}
                  </span>
                  {step.tracked ? (
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
                      {step.value.toLocaleString()}
                      <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>{step.pct}%</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
                      not tracked yet{step.note ? ` · ${step.note}` : ""}
                    </span>
                  )}
                </div>
                {step.tracked && <MiniBar pct={step.pct} height={8} color={step.color} />}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 14, lineHeight: 1.5 }}>
            Stage counts are per-visit events (raw, not de-duplicated by session). Trial→paid lags signup
            by up to the trial length, so Converted is a rolling count, not a same-cohort rate.
          </div>
        </>
      )}
    </Card>
  );
}

// ── AI Insights ───────────────────────────────────────────────────────────────
function InsightsPanel() {
  const [loading, setLoading] = useState(false);
  const [fresh,   setFresh]   = useState(null);
  const [error,   setError]   = useState(null);

  const refresh = async () => {
    setLoading(true); setFresh(null); setError(null);
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFresh(data.insights);
    } catch (e) {
      setError(`Could not fetch insights — ${e.message || "check API connection."}`);
    }
    setLoading(false);
  };

  const items = fresh || [];

  return (
    <Card>
      <SectionTitle
        action={
          <Button onClick={refresh} loading={loading} variant="secondary">
            Generate AI Insights
          </Button>
        }
      >
        {fresh ? "AI Insights (Live)" : "AI Insights"}
      </SectionTitle>
      {error && <div style={{ fontSize: 12, color: C.error, marginBottom: 10 }}>{error}</div>}
      {items.length === 0 && !error && (
        <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0", textAlign: "center" }}>
          No insights yet — click “Generate AI Insights” to analyze the latest data.
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((insight, i) => (
          <div key={i} style={{
            background: C.bgSubtle, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "10px 14px",
            fontSize: 14, color: C.textPrimary, lineHeight: 1.5,
          }}>
            {insight}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Blog Queue ────────────────────────────────────────────────────────────────
function BlogQueue() {
  // No live blog-list endpoint yet — posts authored via the Blog Generator
  // are saved to the repo/Keystatic, not surfaced back here. Honest empty
  // state until that source is wired.
  const posts = [];
  return (
    <Card>
      <SectionTitle
        action={<Badge variant="neutral">{posts.length} posts</Badge>}
      >Blog Queue</SectionTitle>
      {posts.length === 0 && (
        <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0", textAlign: "center" }}>
          No posts to show here yet. Drafts created in the Blog Generator are saved to the site;
          a live blog-list feed for this panel isn’t wired yet.
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {posts.map((post, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: i < posts.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{
                fontSize: 14, color: C.textPrimary,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {post.title}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                {post.date}{post.social > 0 ? ` · ${post.social} social posts queued` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <Badge variant={statusVariant(post.status)}>{statusLabel(post.status)}</Badge>
              {post.status === "draft" && <SmallButton variant="primary">Write</SmallButton>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Social Queue ──────────────────────────────────────────────────────────────
function SocialQueue() {
  const [livePosts, setLivePosts] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);

  useEffect(() => {
    fetch("/api/social-queue")
      .then(r => r.json())
      .then(data => { setLivePosts(data.posts || []); setLiveLoading(false); })
      .catch(() => setLiveLoading(false));
  }, []);

  const isLive = !liveLoading && livePosts !== null;
  const displayPosts = isLive && livePosts.length > 0
    ? livePosts.map(p => ({
        platform: p.platform?.charAt(0).toUpperCase() + p.platform?.slice(1) || "Unknown",
        content: p.content,
        scheduled: p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
        status: p.publishedAt ? "published" : new Date(p.scheduledFor) > new Date() ? "scheduled" : "draft",
      }))
    : [];

  return (
    <Card>
      <SectionTitle
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant={isLive ? "success" : "neutral"}>
              {liveLoading ? "Loading…" : isLive ? "Live Queue" : "No data yet"}
            </Badge>
            <Badge variant="info">{displayPosts.length} queued</Badge>
          </div>
        }
      >Social Queue</SectionTitle>
      {displayPosts.length === 0 && (
        <div style={{ fontSize: 13, color: C.textMuted, padding: "16px 0", textAlign: "center" }}>
          No posts queued. Generate social posts from the Blog Generator.
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {displayPosts.map((post, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, alignItems: "flex-start",
            padding: "10px 0",
            borderBottom: i < displayPosts.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            <PlatformIcon platform={post.platform} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, color: C.textPrimary, lineHeight: 1.4,
                display: "-webkit-box", WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {post.content}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{post.scheduled}</div>
            </div>
            <Badge variant={statusVariant(post.status)}>{statusLabel(post.status)}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Leads ─────────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function enrichmentText(e) {
  if (!e || typeof e !== "object") return "—";
  const parts = [e.estimatedSize, e.likelyType, e.priority].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function LeadsPanel() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/leads-list")
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 401 ? "admin login required" : `HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setRows(d.leads || []); setTotal(d.total ?? (d.leads || []).length); setLoading(false); })
      .catch(e => { setError(e.message); setRows([]); setLoading(false); });
  }, []);

  const exportCSV = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/leads-export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `da-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed — ${e.message}`);
    }
    setExporting(false);
  };

  const displayLeads = rows || [];

  return (
    <Card>
      <SectionTitle
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant={total !== null ? "success" : "neutral"}>
              {loading ? "…" : total !== null ? `${total} total` : "unavailable"}
            </Badge>
            <SmallButton variant="secondary" onClick={exportCSV} disabled={exporting}>
              {exporting ? "Exporting…" : "Export CSV"}
            </SmallButton>
          </div>
        }
      >Recent Leads</SectionTitle>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 3fr",
        background: C.bgSubtle, borderBottom: `1px solid ${C.border}`,
        padding: "6px 8px",
      }}>
        {["Name", "Dealership", "Source", "Time", "AI Enrichment"].map(h => (
          <div key={h} style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, textTransform: "uppercase" }}>
            {h}
          </div>
        ))}
      </div>

      {(loading || error || displayLeads.length === 0) && (
        <div style={{ fontSize: 13, color: error ? C.error : C.textMuted, padding: "16px 8px", textAlign: "center" }}>
          {loading ? "Loading…" : error ? `Could not load leads — ${error}` : "No leads captured yet."}
        </div>
      )}
      {displayLeads.map((lead, i) => (
        <div key={lead.id || i} style={{
          display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 3fr",
          padding: "10px 8px",
          borderBottom: `1px solid ${C.border}`,
          background: i % 2 === 1 ? C.bgSubtle : C.bgSurface,
          alignItems: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>{lead.name || "—"}</div>
          <div style={{ fontSize: 14, color: C.textSecondary }}>{lead.dealership || "—"}</div>
          <div>{lead.source ? <Badge variant="info">{lead.source}</Badge> : <span style={{ fontSize: 12, color: C.textMuted }}>—</span>}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{timeAgo(lead.created_at)}</div>
          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>{enrichmentText(lead.ai_enrichment)}</div>
        </div>
      ))}
    </Card>
  );
}

// ── Google integration (Phase 1 — read-only) ─────────────────────────────────
// Connect / Analytics / Ads / SEO / Approvals. Every panel degrades to a clean
// "not connected" state: the credentials arrive on Google's schedule (the Ads
// developer token especially), so a missing one must never look like a bug.

const RANGES = [
  { days: 7,  label: "7 days"  },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const DateRange = ({ days, onChange, onRefresh, refreshing }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
    {RANGES.map(r => (
      <button key={r.days} onClick={() => onChange(r.days)} style={{
        height: 28, padding: "0 10px", fontSize: 12,
        background: days === r.days ? C.blue : C.bgSurface,
        color: days === r.days ? "#fff" : C.textPrimary,
        border: `1px solid ${days === r.days ? C.blue : C.border}`,
        borderRadius: 4, cursor: "pointer", fontFamily: "Roboto, sans-serif",
      }}>{r.label}</button>
    ))}
    {onRefresh && (
      <SmallButton onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </SmallButton>
    )}
  </div>
);

// Shared empty state. `missing` lists the env vars that would light this up —
// far more actionable than a generic "not connected".
const NotConnected = ({ title, reason, missing, note }) => (
  <div style={{
    border: `1px dashed ${C.borderStrong}`, borderRadius: 6,
    padding: 20, background: C.bgSubtle,
  }}>
    <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 6 }}>
      {title}
    </div>
    <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: missing?.length ? 10 : 0 }}>
      {reason}
    </div>
    {missing?.length > 0 && (
      <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "monospace" }}>
        Missing: {missing.join(", ")}
      </div>
    )}
    {note && (
      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 10 }}>{note}</div>
    )}
  </div>
);

const fmtInt   = (n) => (n ?? 0).toLocaleString();
const fmtMoney = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct   = (n) => `${((n ?? 0) * 100).toFixed(2)}%`;
const fmtPos   = (n) => (n ?? 0).toFixed(1);

// Small stat used across the three Google panels.
const Stat = ({ label, value, sub, color }) => (
  <Card style={{ padding: 16 }}>
    <div style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
      {label}
    </div>
    <div style={{ fontSize: 28, fontWeight: 600, color: C.textPrimary, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: color || C.textMuted, marginTop: 6 }}>{sub}</div>}
  </Card>
);

// Shared fetch hook for the three report panels — same loading/error/range
// behaviour in one place so the panels differ only in how they render.
function useGoogleReport(path, days) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);

  const load = (force = false) => {
    if (force) setRefreshing(true); else setState(s => ({ ...s, loading: true }));
    fetch(`${path}?days=${days}${force ? "&refresh=1" : ""}`)
      .then(r => r.json())
      .then(d => setState({ loading: false, data: d, error: d.error || null }))
      .catch(() => setState({ loading: false, data: null, error: "Request failed" }))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => { load(false); /* eslint-disable-next-line */ }, [path, days]);
  return { ...state, refreshing, refresh: () => load(true) };
}

// ── Connect Google ────────────────────────────────────────────────────────────
function GoogleConnectPanel({ onStatus }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/google/status")
    .then(r => r.json())
    .then(d => { setStatus(d); onStatus?.(d); })
    .catch(() => setStatus({ error: "Could not read connection status" }));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const disconnect = async () => {
    if (!confirm("Disconnect Google? Reporting stops until you reconnect.")) return;
    setBusy(true);
    await fetch("/api/google/disconnect", { method: "POST" }).catch(() => {});
    setBusy(false);
    load();
  };

  const conn = status?.connection;
  const configured = conn?.configured;
  const connected = conn?.connected;

  return (
    <Card>
      <SectionTitle action={
        connected
          ? <SmallButton onClick={disconnect} variant="danger" disabled={busy}>Disconnect</SmallButton>
          : null
      }>
        Google Connection
      </SectionTitle>

      {!status && <div style={{ fontSize: 13, color: C.textMuted }}>Checking…</div>}

      {status && !configured && (
        <NotConnected
          title="Google OAuth is not configured yet"
          reason="Add the OAuth client credentials to the environment on the box, then restart the app to enable the Connect button."
          missing={status.surfaces ? undefined : undefined}
          note="Client ID and secret come from Google Cloud → APIs & Services → Credentials."
        />
      )}

      {status && configured && !connected && (
        <div>
          {conn?.needsReconnect ? (
            <div style={{
              border: `1px solid ${C.warning}`, background: "#fff8ec",
              borderRadius: 4, padding: "10px 12px", marginBottom: 14,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>
                Google connection expired — reconnect
              </div>
              <div style={{ fontSize: 12, color: C.textSecondary }}>
                Google rejected the stored refresh token. While the OAuth app is in
                <strong> Testing</strong> publishing status Google expires refresh tokens after
                7 days, so expect this about weekly until the app is published to Production.
                Reconnecting takes one click and no data is lost.
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: C.textSecondary, margin: "0 0 14px" }}>
              One-time authorization. Grants read access to Google Ads, Analytics (GA4) and
              Search Console for this account. The refresh token is stored encrypted on the
              server and never reaches the browser.
            </p>
          )}
          <a href="/api/google/oauth/start" style={{
            display: "inline-block", height: 36, lineHeight: "36px", padding: "0 16px",
            background: C.blue, color: "#fff", border: `1px solid ${C.blue}`,
            borderRadius: 4, fontSize: 14, fontWeight: 500, textDecoration: "none",
            fontFamily: "Roboto, sans-serif",
          }}>{conn?.needsReconnect ? "Reconnect Google" : "Connect Google"}</a>
          {conn?.lastError && !conn?.needsReconnect && (
            <div style={{ fontSize: 12, color: C.error, marginTop: 10 }}>
              Last error: {conn.lastError}
            </div>
          )}
        </div>
      )}

      {status && connected && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge variant="success">Connected</Badge>
            <span style={{ fontSize: 14, color: C.textPrimary }}>
              {conn.accountEmail || "Google account"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            Connected {conn.connectedAt ? new Date(conn.connectedAt).toLocaleString() : "—"}
            {" · "}last token refresh {conn.lastRefreshAt ? new Date(conn.lastRefreshAt).toLocaleString() : "not yet"}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, fontFamily: "monospace", wordBreak: "break-all" }}>
            {(conn.scopes || []).map(s => s.replace("https://www.googleapis.com/auth/", "")).join(" · ")}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {[
              ["Analytics (GA4)", status.surfaces?.ga4?.configured],
              ["Search Console",  status.surfaces?.gsc?.configured],
              ["Google Ads",      status.surfaces?.ads?.configured],
            ].map(([label, ok]) => (
              <Badge key={label} variant={ok ? "success" : "warning"}>
                {label}: {ok ? "ready" : "needs config"}
              </Badge>
            ))}
          </div>
          {status.surfaces?.ads?.awaitingDeveloperToken && (
            <div style={{ fontSize: 12, color: C.textMuted }}>
              Google Ads reporting turns on when the developer token is approved and added
              to the environment. Analytics and Search Console do not need it.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Analytics (GA4) ───────────────────────────────────────────────────────────
function AnalyticsPanel() {
  const [days, setDays] = useState(30);
  const { loading, data, refreshing, refresh } = useGoogleReport("/api/google/analytics", days);
  const d = data?.data;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <SectionTitle action={<DateRange days={days} onChange={setDays} onRefresh={refresh} refreshing={refreshing} />}>
          Google Analytics 4
        </SectionTitle>

        {loading && <div style={{ fontSize: 13, color: C.textMuted }}>Loading…</div>}

        {!loading && data && !data.connected && (
          <NotConnected
            title="Analytics not connected"
            reason={data.reason === "not-connected"
              ? "Connect Google on the Overview tab to enable GA4 reporting."
              : "GA4 is connected but no property is configured."}
            missing={data.missing}
          />
        )}

        {!loading && data?.error && data.connected && (
          <div style={{ fontSize: 13, color: C.error }}>GA4 error — {data.error}</div>
        )}

        {!loading && d && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              <Stat label="Sessions" value={fmtInt(d.sessions)} />
              <Stat label="Users" value={fmtInt(d.totalUsers)}
                    sub={`${fmtInt(d.newUsers)} new · ${fmtInt(d.returningUsers)} returning`} />
              <Stat label="Engagement Rate" value={fmtPct(d.engagementRate)}
                    sub={`${fmtInt(d.engagedSessions)} engaged sessions`} />
              <Stat label="Conversions" value={fmtInt(d.conversions)}
                    sub="GA4 conversion events" color={C.success} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 10 }}>
                  Top channels
                </div>
                {(d.channels || []).length === 0 && (
                  <div style={{ fontSize: 13, color: C.textMuted }}>No channel data in range.</div>
                )}
                {(d.channels || []).map((c, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: C.textPrimary }}>{c.channel}</span>
                      <span style={{ fontSize: 13, color: C.textSecondary }}>{fmtInt(c.sessions)}</span>
                    </div>
                    <MiniBar pct={d.sessions > 0 ? (c.sessions / d.sessions) * 100 : 0} />
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 10 }}>
                  Top sources
                </div>
                {(d.sources || []).map((s, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13,
                  }}>
                    <span style={{ color: C.textPrimary }}>{s.source}</span>
                    <span style={{ color: C.textSecondary }}>{fmtInt(s.sessions)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {d && <FunnelPanel ga4={d} />}
    </div>
  );
}

// ── Ads (read-only) ───────────────────────────────────────────────────────────
function AdsPanel() {
  const [days, setDays] = useState(30);
  const { loading, data, refreshing, refresh } = useGoogleReport("/api/google/ads", days);
  const d = data?.data;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <SectionTitle action={<DateRange days={days} onChange={setDays} onRefresh={refresh} refreshing={refreshing} />}>
          Google Ads <span style={{ fontSize: 12, fontWeight: 400, color: C.textMuted }}>· read-only</span>
        </SectionTitle>

        {loading && <div style={{ fontSize: 13, color: C.textMuted }}>Loading…</div>}

        {!loading && data && !data.connected && data.awaitingBasicAccess && (
          <NotConnected
            title="Awaiting Basic Access approval from Google"
            reason={
              "The developer token is installed but still at TEST access level, which can only " +
              "read Google's test accounts — not the live Dealer Addendums account. Google upgrades " +
              "the token to Basic on its own schedule; this section starts working automatically the " +
              "day it does, with no code or config change. Analytics and Search Console are unaffected."
            }
            note={data.code ? `Google reported: ${data.code}` : undefined}
          />
        )}

        {!loading && data && !data.connected && !data.awaitingBasicAccess && (
          <NotConnected
            title={data.awaitingDeveloperToken ? "Awaiting Google Ads API token" : "Google Ads not connected"}
            reason={data.awaitingDeveloperToken
              ? "Google reviews developer-token applications separately from OAuth — this section turns on the day it is approved and added to the environment. Analytics and Search Console are unaffected."
              : "Connect Google on the Overview tab, then add the Ads customer ID."}
            missing={data.missing}
          />
        )}

        {!loading && data?.error && data.connected && (
          <div style={{ fontSize: 13, color: C.error }}>Google Ads error — {data.error}</div>
        )}

        {!loading && d && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              <Stat label="Spend" value={fmtMoney(d.account.cost)} />
              <Stat label="Impressions" value={fmtInt(d.account.impressions)} />
              <Stat label="Clicks" value={fmtInt(d.account.clicks)} sub={`CTR ${fmtPct(d.account.ctr)}`} />
              <Stat label="Conversions" value={fmtInt(d.account.conversions)} color={C.success} />
              <Stat label="CPA" value={d.account.conversions > 0 ? fmtMoney(d.account.cpa) : "—"} />
            </div>
          </>
        )}
      </Card>

      {d && (
        <Card>
          <SectionTitle>Campaigns</SectionTitle>
          {d.campaigns.length === 0 && (
            <div style={{ fontSize: 13, color: C.textMuted }}>No campaign activity in this range.</div>
          )}
          {d.campaigns.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: C.textMuted }}>
                    {["Campaign", "Status", "Spend", "Impr.", "Clicks", "CTR", "Conv.", "CPA"].map(h => (
                      <th key={h} style={{ padding: "0 8px 8px 0", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.campaigns.map(c => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 8px 8px 0", color: C.textPrimary }}>{c.name}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>
                        <Badge variant={c.status === "ENABLED" ? "success" : "neutral"}>{c.status}</Badge>
                      </td>
                      <td style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>{fmtMoney(c.cost)}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{fmtInt(c.impressions)}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{fmtInt(c.clicks)}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{fmtPct(c.ctr)}</td>
                      <td style={{ padding: "8px 8px 8px 0" }}>{fmtInt(c.conversions)}</td>
                      <td style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>
                        {c.conversions > 0 ? fmtMoney(c.cpa) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {d && d.keywords.length > 0 && (
        <Card>
          <SectionTitle>Top keywords by spend</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.textMuted }}>
                  {["Keyword", "Match", "Campaign", "Spend", "Clicks", "CTR", "Conv."].map(h => (
                    <th key={h} style={{ padding: "0 8px 8px 0", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.keywords.map((k, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 8px 8px 0", color: C.textPrimary }}>{k.keyword}</td>
                    <td style={{ padding: "8px 8px 8px 0", color: C.textMuted }}>{k.matchType}</td>
                    <td style={{ padding: "8px 8px 8px 0", color: C.textMuted }}>{k.campaign}</td>
                    <td style={{ padding: "8px 8px 8px 0", whiteSpace: "nowrap" }}>{fmtMoney(k.cost)}</td>
                    <td style={{ padding: "8px 8px 8px 0" }}>{fmtInt(k.clicks)}</td>
                    <td style={{ padding: "8px 8px 8px 0" }}>{fmtPct(k.ctr)}</td>
                    <td style={{ padding: "8px 8px 8px 0" }}>{fmtInt(k.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── SEO (Search Console) ──────────────────────────────────────────────────────
function SeoPanel() {
  const [days, setDays] = useState(30);
  const { loading, data, refreshing, refresh } = useGoogleReport("/api/google/seo", days);
  const d = data?.data;

  // Position trend: Search Console reports average position where LOWER is
  // better, so the arrow is inverted relative to every other metric here.
  const trend = d?.trend || [];
  const firstHalf = trend.slice(0, Math.floor(trend.length / 2));
  const lastHalf  = trend.slice(Math.floor(trend.length / 2));
  const avg = (rows) => rows.length ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0;
  const posDelta = trend.length >= 4 ? avg(firstHalf) - avg(lastHalf) : null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <SectionTitle action={<DateRange days={days} onChange={setDays} onRefresh={refresh} refreshing={refreshing} />}>
          Search Console {data?.site && (
            <span style={{ fontSize: 12, fontWeight: 400, color: C.textMuted }}>· {data.site}</span>
          )}
        </SectionTitle>

        {loading && <div style={{ fontSize: 13, color: C.textMuted }}>Loading…</div>}

        {!loading && data && !data.connected && (
          <NotConnected
            title="Search Console not connected"
            reason={data.reason === "not-connected"
              ? "Connect Google on the Overview tab to enable Search Console reporting."
              : "Google is connected but no Search Console site is configured."}
            missing={data.missing}
            note="GSC_SITE_URL is either a URL prefix (https://www.dealeraddendums.com/) or a domain property (sc-domain:dealeraddendums.com)."
          />
        )}

        {!loading && data?.error && data.connected && (
          <div style={{ fontSize: 13, color: C.error }}>Search Console error — {data.error}</div>
        )}

        {!loading && d && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <Stat label="Clicks" value={fmtInt(d.totals.clicks)} />
            <Stat label="Impressions" value={fmtInt(d.totals.impressions)} />
            <Stat label="CTR" value={fmtPct(d.totals.ctr)} />
            <Stat
              label="Avg Position"
              value={fmtPos(d.totals.position)}
              sub={posDelta === null ? "lower is better"
                : posDelta > 0 ? `improved ${posDelta.toFixed(1)} vs first half`
                : `down ${Math.abs(posDelta).toFixed(1)} vs first half`}
              color={posDelta === null ? undefined : posDelta > 0 ? C.success : C.warning}
            />
          </div>
        )}
      </Card>

      {d && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <Card>
            <SectionTitle>Top queries</SectionTitle>
            {d.queries.length === 0 && <div style={{ fontSize: 13, color: C.textMuted }}>No query data in range.</div>}
            {d.queries.map((q, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto",
                gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13,
              }}>
                <span style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>{q.query}</span>
                <span style={{ color: C.textSecondary }}>{fmtInt(q.clicks)} clk</span>
                <span style={{ color: C.textMuted }}>{fmtPct(q.ctr)}</span>
                <span style={{ color: C.textMuted }}>#{fmtPos(q.position)}</span>
              </div>
            ))}
          </Card>
          <Card>
            <SectionTitle>Top pages</SectionTitle>
            {d.pages.map((p, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto",
                gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13,
              }}>
                <span style={{ color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.page.replace(/^https?:\/\/[^/]+/, "") || "/"}
                </span>
                <span style={{ color: C.textSecondary }}>{fmtInt(p.clicks)} clk</span>
                <span style={{ color: C.textMuted }}>#{fmtPos(p.position)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Recommendations / Approvals ───────────────────────────────────────────────
// Phase 1 ships this empty on purpose: nothing produces proposed changes yet.
// The UI and endpoints exist now so Phase 2/3 producers drop in without rework.
function ApprovalsPanel() {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [note, setNote] = useState(null);

  const load = () => fetch("/api/proposed-changes?status=pending")
    .then(r => r.json())
    .then(d => setRows(d.changes || []))
    .catch(() => setRows([]));

  useEffect(() => { load(); }, []);

  const decide = async (id, action) => {
    setBusyId(id);
    const res = await fetch(`/api/proposed-changes/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).then(r => r.json()).catch(() => ({ error: "Request failed" }));
    setBusyId(null);
    setNote(res.note || res.error || null);
    load();
  };

  return (
    <Card>
      <SectionTitle action={<SmallButton onClick={load}>Refresh</SmallButton>}>
        Recommendations &amp; Approvals
      </SectionTitle>

      <p style={{ fontSize: 13, color: C.textSecondary, margin: "0 0 16px" }}>
        Anything that would spend money lands here first. Nothing is pushed to Google
        until you approve it.
      </p>

      {note && (
        <div style={{
          fontSize: 12, color: C.textSecondary, background: C.bgSubtle,
          border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 10px", marginBottom: 12,
        }}>{note}</div>
      )}

      {rows === null && <div style={{ fontSize: 13, color: C.textMuted }}>Loading…</div>}

      {rows?.length === 0 && (
        <NotConnected
          title="No pending changes"
          reason="Nothing is waiting for approval. Phase 1 is read-only reporting — no automation proposes changes yet."
          note="Phase 2 (Ads management) and Phase 3 (AI recommendations) will populate this queue."
        />
      )}

      {rows?.map(r => (
        <div key={r.id} style={{
          border: `1px solid ${C.border}`, borderRadius: 4,
          padding: 14, marginBottom: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <Badge variant="info">{r.type}</Badge>
              <span style={{ fontSize: 14, color: C.textPrimary, marginLeft: 8 }}>
                {r.summary || r.target_label || "Proposed change"}
              </span>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                {new Date(r.created_at).toLocaleString()}
                {r.source ? ` · ${r.source}` : ""}
              </div>
              {r.rationale && (
                <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 6 }}>{r.rationale}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <SmallButton variant="success" disabled={busyId === r.id}
                           onClick={() => decide(r.id, "approve")}>Approve</SmallButton>
              <SmallButton variant="danger" disabled={busyId === r.id}
                           onClick={() => decide(r.id, "reject")}>Reject</SmallButton>
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ── Nav tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",  label: "Overview"     },
  { id: "analytics", label: "Analytics"    },
  { id: "ads",       label: "Ads"          },
  { id: "seo",       label: "SEO"          },
  { id: "ab",        label: "A/B Tests"    },
  { id: "copy",      label: "AI Copy"      },
  { id: "blog",      label: "Blog & Social"},
  { id: "leads",     label: "Leads"        },
  { id: "approvals", label: "Approvals"    },
];

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("overview");

  // Live stats from Supabase via admin-stats API
  const [stats, setStats] = useState({
    visitors:       { value: "—", delta: "loading…" },
    trials:         { value: "—", delta: "loading…" },
    conversionRate: { value: "—", delta: "loading…" },
    activeDealers:  { value: "—", delta: "loading…" },
  });
  const [statsLoaded, setStatsLoaded] = useState(false);

  // GA4 (when Google is connected) is the better answer for site-wide traffic:
  // the first-party hero_impression event fires only on the homepage and /lp
  // pages, so it undercounts everything else (blog, pricing, legal). Trial
  // Signups stay first-party either way — marketing_leads is the authoritative
  // record of a signup, not a GA4 conversion event.
  const [ga4, setGa4] = useState(null);
  useEffect(() => {
    fetch("/api/admin-stats")
      .then(r => r.json())
      .then(data => { setStats(data); setStatsLoaded(true); })
      .catch(() => setStatsLoaded(true));
    fetch("/api/google/analytics?days=30")
      .then(r => r.json())
      .then(d => { if (d?.connected && d.data) setGa4(d.data); })
      .catch(() => {});
  }, []);

  const ga4Live = !!ga4;
  const ga4ConvRate = ga4Live && ga4.sessions > 0
    ? ((ga4.funnel?.signups ?? 0) / ga4.sessions) * 100
    : null;

  const statCards = [
    ga4Live
      ? { label: "Monthly Visitors", value: (ga4.sessions ?? 0).toLocaleString(),
          delta: `${(ga4.totalUsers ?? 0).toLocaleString()} users · GA4`, color: C.success }
      : { label: "Monthly Visitors",  ...stats.visitors,       color: C.success },
    { label: "Trial Signups",     ...stats.trials,          color: C.success },
    ga4ConvRate !== null
      ? { label: "Conversion Rate", value: `${ga4ConvRate.toFixed(1)}%`,
          delta: "signups ÷ GA4 sessions", color: C.success }
      : { label: "Conversion Rate",   ...stats.conversionRate,  color: C.success },
    { label: "Active Dealers",    ...stats.activeDealers,   color: C.blue    },
  ];

  return (
    <div style={{
      fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
      background: C.bgApp,
      minHeight: "100vh",
      color: C.textPrimary,
    }}>

      {/* Topbar — navy per DA spec */}
      <div style={{
        background: C.navy,
        height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: C.orange, color: C.navy,
            fontWeight: 700, fontSize: 11,
            padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em",
          }}>DA</div>
          <span style={{ fontSize: 14, fontWeight: 500, color: C.textInverse }}>Marketing OS</span>
          <Badge variant="success">Live</Badge>
        </div>

        {/* Nav tabs — orange active state per DA spec */}
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 16px",
              background: tab === t.id ? "rgba(255,165,0,0.15)" : "none",
              borderLeft: tab === t.id ? `3px solid ${C.orange}` : "3px solid transparent",
              borderTop: "none", borderRight: "none", borderBottom: "none",
              color: tab === t.id ? C.orange : "rgba(255,255,255,0.8)",
              fontSize: 14, cursor: "pointer",
              fontFamily: "Roboto, sans-serif",
              transition: "all 0.1s",
            }}>
              {t.label}
            </button>
          ))}
          {/* Reputation Manager — separate route (not an in-SPA tab) */}
          <a href="/reputation" style={{
            padding: "10px 16px",
            background: "none",
            borderLeft: "3px solid transparent",
            color: "rgba(255,255,255,0.8)",
            fontSize: 14, cursor: "pointer",
            fontFamily: "Roboto, sans-serif",
            textDecoration: "none",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span aria-hidden>★</span> Reputation
          </a>
        </div>

        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          dealeraddendums.com/admin
        </div>
      </div>

      {/* Page content */}
      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>

        {/* Overview */}
        {tab === "overview" && (
          <div style={{ display: "grid", gap: 20 }}>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {statCards.map((s, i) => (
                <Card key={i} style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 600, color: C.textPrimary, lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 12, color: s.color, marginTop: 6 }}>{s.delta}</div>
                </Card>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: -8 }}>
              {ga4Live
                ? "Traffic and conversion rate from Google Analytics 4. Trial signups and active dealers are first-party."
                : "Traffic from first-party events (homepage + landing pages only). Connect Google below for site-wide GA4 numbers."}
            </div>
            <GoogleConnectPanel />
            <InsightsPanel />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <FunnelPanel ga4={ga4} />
              <LeadsPanel />
            </div>
          </div>
        )}

        {tab === "analytics" && <AnalyticsPanel />}
        {tab === "ads"       && <AdsPanel />}
        {tab === "seo"       && <SeoPanel />}
        {tab === "approvals" && <ApprovalsPanel />}

        {tab === "ab" && (
          <div style={{ display: "grid", gap: 20 }}>
            <ABPanel />
            <FunnelPanel />
          </div>
        )}

        {tab === "copy" && (
          <div style={{ display: "grid", gap: 20 }}>
            <CopyGenerator />
            <InsightsPanel />
          </div>
        )}

        {tab === "blog" && (
          <div style={{ display: "grid", gap: 20 }}>
            <BlogGenerator />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <BlogQueue />
              <SocialQueue />
            </div>
          </div>
        )}

        {tab === "leads" && (
          <div style={{ display: "grid", gap: 20 }}>
            <LeadsPanel />
            <InsightsPanel />
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", padding: 24, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
        DealerAddendums Marketing OS · Self-hosted on EC2 · Powered by Claude AI
      </div>
    </div>
  );
}
