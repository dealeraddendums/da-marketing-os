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
const AB_EXPERIMENTS = [
  {
    id: "hero-headline",
    name: "Hero Headline Test",
    status: "running",
    started: "Apr 14",
    variants: [
      { name: "Control",      visitors: 2841, conversions: 127, rate: 4.47 },
      { name: "Urgency",      visitors: 2756, conversions: 154, rate: 5.59 },
      { name: "Social Proof", visitors: 2803, conversions: 143, rate: 5.10 },
    ],
    significance: 94,
    winner: "Urgency",
  },
  {
    id: "cta-color",
    name: "CTA Button Color",
    status: "running",
    started: "Apr 18",
    variants: [
      { name: "Blue",   visitors: 1204, conversions: 49, rate: 4.07 },
      { name: "Green",  visitors: 1189, conversions: 61, rate: 5.13 },
      { name: "Yellow", visitors: 1211, conversions: 67, rate: 5.53 },
    ],
    significance: 71,
    winner: null,
  },
];

const FUNNEL = [
  { label: "Visitors",       value: 18420, pct: 100 },
  { label: "Engaged (30s+)", value: 9814,  pct: 53  },
  { label: "Pricing Viewed", value: 4203,  pct: 23  },
  { label: "Form Started",   value: 1102,  pct: 6.0 },
  { label: "Trial Signup",   value: 744,   pct: 4.0 },
  { label: "Converted",      value: 89,    pct: 0.5 },
];

const BLOG_QUEUE = [
  { title: "FTC Compliance for Car Dealers in 2026",            status: "published",  date: "Apr 20", social: 3 },
  { title: "Addendum vs. Buyers Guide: What's the Difference?", status: "scheduled",  date: "Apr 26", social: 0 },
  { title: "How to Reduce Printing Time by 80%",                status: "draft",      date: "—",      social: 0 },
  { title: "Top 5 Addendum Mistakes Dealers Make",              status: "draft",      date: "—",      social: 0 },
];

const SOCIAL_QUEUE = [
  { platform: "LinkedIn", content: "FTC compliance doesn't have to be complicated. Here's how 1,600+ dealers stay protected...", scheduled: "Apr 24 9am",  status: "scheduled" },
  { platform: "Twitter",  content: "526 addendums printed today by our dealers. That's 526 fewer headaches.", scheduled: "Apr 24 11am", status: "scheduled" },
  { platform: "Facebook", content: "New blog: FTC Compliance for Car Dealers in 2026. Everything you need to know in one place.", scheduled: "Apr 25 9am",  status: "scheduled" },
  { platform: "LinkedIn", content: "Did you know the average dealer spends 4+ hours/week on addendums manually? We solve that.", scheduled: "Apr 27 9am",  status: "draft"     },
];

const LEADS = [
  { name: "Mike Torres",   dealership: "Torres Kia",         source: "Google Ads", time: "2h ago",  enrichment: "~5 rooftops, likely franchise group" },
  { name: "Sarah Kim",     dealership: "Pacific Auto Group", source: "LinkedIn",   time: "5h ago",  enrichment: "Multi-location, high-value prospect" },
  { name: "Dave Reinhart", dealership: "Reinhart Ford",      source: "Direct",     time: "1d ago",  enrichment: "Single point dealer, price sensitive" },
  { name: "Alma Reyes",    dealership: "Southwest Motors",   source: "Blog",       time: "2d ago",  enrichment: "Used car focus, compliance concerned" },
];

const INSIGHTS = [
  "📈 The 'Urgency' headline variant is approaching 95% significance — recommend declaring winner and updating control.",
  "📉 Mobile scroll depth on Pricing section dropped 12% this week. Consider moving pricing higher or adding a mobile-specific CTA.",
  "🎯 Visitors from LinkedIn have a 2.3× higher conversion rate than Google Ads. Recommend increasing LinkedIn ad spend.",
  "✍️ Blog post about FTC compliance drove 340 organic visits in 48 hours. Publish 2–3 more compliance-focused posts.",
];

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

  const experiments = liveExperiments || AB_EXPERIMENTS;
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
                  : <Badge variant="warning">Demo Data</Badge>
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
function FunnelPanel() {
  return (
    <Card>
      <SectionTitle>Conversion Funnel — Last 30 Days</SectionTitle>
      <div style={{ display: "grid", gap: 10 }}>
        {FUNNEL.map((step, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 14, color: i === 0 ? C.textPrimary : C.textSecondary }}>
                {step.label}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: i === FUNNEL.length - 1 ? C.success : C.textPrimary }}>
                {step.value.toLocaleString()}
                <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>{step.pct}%</span>
              </span>
            </div>
            <MiniBar
              pct={step.pct}
              height={8}
              color={i === FUNNEL.length - 1 ? C.success : i === 0 ? C.blue : C.blueLight}
            />
          </div>
        ))}
      </div>
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

  const items = fresh || INSIGHTS;

  return (
    <Card>
      <SectionTitle
        action={
          <Button onClick={refresh} loading={loading} variant="secondary">
            Refresh AI Insights
          </Button>
        }
      >
        {fresh ? "AI Insights (Live)" : "AI Weekly Insights"}
      </SectionTitle>
      {error && <div style={{ fontSize: 12, color: C.error, marginBottom: 10 }}>{error}</div>}
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
  return (
    <Card>
      <SectionTitle
        action={<Badge variant="info">{BLOG_QUEUE.length} posts</Badge>}
      >Blog Queue</SectionTitle>
      <div style={{ display: "grid", gap: 8 }}>
        {BLOG_QUEUE.map((post, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: i < BLOG_QUEUE.length - 1 ? `1px solid ${C.border}` : "none",
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
    : SOCIAL_QUEUE;

  return (
    <Card>
      <SectionTitle
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant={isLive ? "success" : liveLoading ? "neutral" : "warning"}>
              {liveLoading ? "Loading…" : isLive ? "Live Queue" : "Demo Data"}
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
function LeadsPanel() {
  const [leads, setLeads] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    // Fetch live leads from Supabase via a future /api/leads-list endpoint
    // For now, fall back to mock data if the endpoint doesn't exist
    fetch("/api/leads-export", { method: "GET" })
      .then(r => {
        if (!r.ok) throw new Error("not available");
        // Parse CSV to get count
        return r.text();
      })
      .then(csv => {
        const rows = csv.trim().split("\n").slice(1); // skip header
        setLeads(rows.length);
        setLoading(false);
      })
      .catch(() => { setLeads(null); setLoading(false); });
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

  const displayLeads = LEADS; // shown from mock; real data reflected in count badge

  return (
    <Card>
      <SectionTitle
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge variant="success">
              {loading ? "…" : leads !== null ? `${leads} total` : "4 new"}
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

      {displayLeads.map((lead, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 3fr",
          padding: "10px 8px",
          borderBottom: `1px solid ${C.border}`,
          background: i % 2 === 1 ? C.bgSubtle : C.bgSurface,
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>{lead.name}</div>
          <div style={{ fontSize: 14, color: C.textSecondary }}>{lead.dealership}</div>
          <div><Badge variant="info">{lead.source}</Badge></div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{lead.time}</div>
          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>{lead.enrichment}</div>
        </div>
      ))}
    </Card>
  );
}

// ── Nav tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview", label: "Overview"    },
  { id: "ab",       label: "A/B Tests"   },
  { id: "copy",     label: "AI Copy"     },
  { id: "blog",     label: "Blog & Social"},
  { id: "leads",    label: "Leads"       },
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

  useEffect(() => {
    fetch("/api/admin-stats")
      .then(r => r.json())
      .then(data => { setStats(data); setStatsLoaded(true); })
      .catch(() => setStatsLoaded(true));
  }, []);

  const statCards = [
    { label: "Monthly Visitors",  ...stats.visitors,       color: C.success },
    { label: "Trial Signups",     ...stats.trials,          color: C.success },
    { label: "Conversion Rate",   ...stats.conversionRate,  color: C.success },
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
            <InsightsPanel />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <FunnelPanel />
              <LeadsPanel />
            </div>
          </div>
        )}

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
