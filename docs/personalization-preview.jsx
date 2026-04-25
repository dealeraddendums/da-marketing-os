import { useState, useEffect, useCallback } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       "#06080a",
  surface:  "#0e1014",
  card:     "#13161b",
  border:   "#1c2028",
  accent:   "#e8ff47",
  accentLo: "#b8cc2a22",
  text:     "#dde3ea",
  muted:    "#505a66",
  green:    "#34d399",
  blue:     "#60a5fa",
  orange:   "#fb923c",
  red:      "#f87171",
  purple:   "#a78bfa",
};

// ── Static term map (subset — same as lib/personalization.ts) ─────────────────
const STATIC_MAP = {
  "car dealer addendum software": {
    headline: "The #1 Addendum Software for Car Dealers",
    subheadline: "Stop printing addendums by hand. 1,600+ dealers automate it in seconds.",
    cta: "Start Free Trial", socialProof: "Trusted by 1,644 dealerships since 2014",
  },
  "vehicle addendum": {
    headline: "Vehicle Addendums. Done in 30 Seconds.",
    subheadline: "Customized, compliant addendums for every vehicle on your lot.",
    cta: "See How It Works", socialProof: "2.3M+ addendums printed",
  },
  "ftc buyers guide": {
    headline: "Stay FTC Compliant Without the Headache",
    subheadline: "Print certified FTC Buyers Guides for every used vehicle. English and Spanish included.",
    cta: "Start Free Trial", socialProof: "Compliance-first since 2014",
  },
  "kia dealer addendum": {
    headline: "Built for Kia Dealerships",
    subheadline: "Kia-branded addendums with your dealer logo, preloaded OEM products, and compliance templates.",
    cta: "Start Free Trial", socialProof: "Franchise-ready templates included",
  },
  "ford dealer addendum": {
    headline: "Ford Dealer Addendums — Done Right",
    subheadline: "Ford-compliant templates with your dealer branding and preloaded F&I products.",
    cta: "Start Free Trial", socialProof: "1,644 dealers trust DealerAddendums",
  },
  "used car dealer software": {
    headline: "The Used Car Dealer's Secret Weapon",
    subheadline: "Addendums, buyers guides, and CPO info sheets — all from one platform.",
    cta: "Start Free Trial", socialProof: "Built for independent and franchise used car lots",
  },
  "independent dealer addendum": {
    headline: "Professional Addendums for Independent Dealers",
    subheadline: "Look like a franchise dealer without the franchise overhead.",
    cta: "Try Free Today", socialProof: "Month-to-month, no contracts",
  },
  "vin scanner app": {
    headline: "Scan a VIN. Print an Addendum. Done.",
    subheadline: "The DA Installer iOS app lets your team scan VINs and print addendums from the lot.",
    cta: "See the iOS App", socialProof: "iOS app — $10/mo add-on",
  },
  "dealer compliance software": {
    headline: "Compliance That Doesn't Slow You Down",
    subheadline: "FTC-compliant addendums and buyers guides printed in seconds, not hours.",
    cta: "Start Free Trial", socialProof: "Trusted by 1,644 dealers",
  },
  "qr code lead generation car dealer": {
    headline: "Turn Your Addendums Into Lead Machines",
    subheadline: "QR codes on every addendum capture buyer name, phone, and vehicle interest automatically.",
    cta: "See SMS Lead Capture", socialProof: "SMS lead capture — $50/mo add-on",
  },
};

const DEFAULTS = {
  headline: "The #1 Addendum Platform for Car Dealers",
  subheadline: "Easily print customized vehicle addendums, buyers guides, and info sheets from any device.",
  cta: "Start Free Trial",
  socialProof: "Trusted by 1,644 dealerships since 2014",
};

const AB_VARIANTS = [
  { id: "generic",      label: "Generic",      color: C.muted,   desc: "Ignore UTM — show default copy" },
  { id: "personalized", label: "Personalized", color: C.accent,  desc: "Match search term exactly (AI)" },
  { id: "dealertype",   label: "Dealer Type",  color: C.purple,  desc: "Focus on dealer segment detected" },
];

const SUGGESTED_TERMS = [
  "car dealer addendum software", "kia dealer addendum", "ford dealer addendum",
  "ftc buyers guide", "used car dealer software", "vin scanner app",
  "toyota dealer addendum software", "dealer inventory management",
  "car lot addendum printing", "FTC compliance dealership",
];

function detectDealerType(text) {
  const t = text.toLowerCase();
  const makes = ["kia","ford","toyota","honda","chevy","chevrolet","nissan","bmw","mercedes","hyundai","subaru","mazda","jeep","dodge"];
  for (const make of makes) if (t.includes(make)) return make.charAt(0).toUpperCase() + make.slice(1);
  if (t.match(/used|independent|cpo/)) return "Used Car";
  if (t.match(/franchise|group|multi/)) return "Franchise Group";
  if (t.match(/ftc|compliance|buyers guide/)) return "Compliance";
  if (t.match(/ios|app|mobile|scan|vin/)) return "Mobile/App";
  return "General";
}

function findStaticMatch(term) {
  const t = term.toLowerCase().trim();
  if (STATIC_MAP[t]) return { match: STATIC_MAP[t], exact: true };
  for (const [key, val] of Object.entries(STATIC_MAP)) {
    if (t.includes(key) || key.includes(t)) return { match: val, exact: false };
  }
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────
const Tag = ({ children, color }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
    textTransform: "uppercase", padding: "2px 7px", borderRadius: 4,
    background: color + "20", color, border: `1px solid ${color}40`,
  }}>{children}</span>
);

const Glyph = ({ type }) => {
  const map = { static: ["⚡", C.accent], ai: ["🤖", C.purple], generic: ["◉", C.muted], cached: ["📦", C.blue] };
  const [icon, color] = map[type] || ["?", C.muted];
  return <span style={{ fontSize: 12, color }}>{icon}</span>;
};

function HeroPreview({ content, variant, loading, dealerType }) {
  const variantColors = { generic: C.muted, personalized: C.accent, dealertype: C.purple };
  const vc = variantColors[variant] || C.muted;

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      border: `1px solid ${vc}44`,
      background: "linear-gradient(135deg, #0d1117 0%, #0a0f14 100%)",
      position: "relative",
    }}>
      {/* Browser chrome */}
      <div style={{
        background: "#0a0c0f", borderBottom: `1px solid ${C.border}`,
        padding: "8px 14px", display: "flex", alignItems: "center", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          {[C.red, C.orange, C.green].map((c, i) => (
            <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c + "88" }} />
          ))}
        </div>
        <div style={{
          flex: 1, background: C.surface, borderRadius: 5,
          padding: "3px 10px", fontSize: 10, color: C.muted,
          fontFamily: "monospace",
        }}>
          dealeraddendums.com{variant !== "generic" ? "?utm_term=..." : ""}
        </div>
        <Tag color={vc}>{variant}</Tag>
      </div>

      {/* Hero content */}
      <div style={{ padding: "40px 36px 48px", minHeight: 200, position: "relative" }}>
        {/* Subtle grid bg */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }} />

        {loading ? (
          <div>
            {[260, 340, 160, 90].map((w, i) => (
              <div key={i} style={{
                height: i === 0 ? 28 : i === 1 ? 14 : i === 2 ? 38 : 12,
                width: w, borderRadius: 6,
                background: `linear-gradient(90deg, ${C.border} 25%, ${C.surface} 50%, ${C.border} 75%)`,
                backgroundSize: "400% 100%",
                animation: "shimmer 1.4s ease infinite",
                marginBottom: i === 0 ? 12 : i === 1 ? 20 : 12,
              }} />
            ))}
          </div>
        ) : (
          <>
            {dealerType !== "General" && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: vc + "15", border: `1px solid ${vc}30`,
                borderRadius: 20, padding: "3px 12px", marginBottom: 14,
                fontSize: 11, color: vc, fontWeight: 600,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: vc, display: "inline-block" }} />
                {dealerType} Dealer
              </div>
            )}
            <h1 style={{
              margin: "0 0 10px", fontSize: 26, fontWeight: 900,
              color: C.text, lineHeight: 1.2,
              fontFamily: "'Georgia', serif",
            }}>
              {content.headline}
            </h1>
            <p style={{ margin: "0 0 22px", fontSize: 14, color: C.muted, lineHeight: 1.6, maxWidth: 480 }}>
              {content.subheadline}
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button style={{
                background: C.accent, color: C.bg, border: "none",
                borderRadius: 8, padding: "10px 22px",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
                letterSpacing: "0.03em",
              }}>{content.cta}</button>
              <span style={{ fontSize: 12, color: C.muted }}>
                {content.socialProof}
              </span>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }`}</style>
    </div>
  );
}

function ABCompare({ results }) {
  if (!results || results.length < 2) return null;
  const max = Math.max(...results.map(r => r.rate));
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
        letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>
        A/B Conversion Simulation
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {results.map((r, i) => {
          const isWinner = r.rate === max;
          const vc = { generic: C.muted, personalized: C.accent, dealertype: C.purple }[r.variant];
          return (
            <div key={i} style={{
              padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${isWinner ? vc + "55" : C.border}`,
              background: isWinner ? vc + "08" : "transparent",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Tag color={vc}>{r.variant}</Tag>
                  {isWinner && <Tag color={C.green}>winner</Tag>}
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: isWinner ? vc : C.text }}>
                  {r.rate}%
                </span>
              </div>
              <div style={{ background: C.border, borderRadius: 99, height: 5 }}>
                <div style={{
                  width: `${(r.rate / 8) * 100}%`, height: "100%",
                  background: vc, borderRadius: 99, transition: "width 0.5s ease",
                }} />
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {r.conversions} / {r.visitors} visitors
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [utmTerm, setUtmTerm]         = useState("kia dealer addendum");
  const [abVariant, setAbVariant]     = useState("personalized");
  const [content, setContent]         = useState(null);
  const [sourceType, setSourceType]   = useState(null); // 'static' | 'ai' | 'generic'
  const [loading, setLoading]         = useState(false);
  const [aiReasoning, setAiReasoning] = useState(null);
  const [error, setError]             = useState(null);
  const [termInput, setTermInput]     = useState("kia dealer addendum");
  const [allVariants, setAllVariants] = useState(null);
  const [activeTab, setActiveTab]     = useState("preview"); // preview | compare | map

  const dealerType = detectDealerType(utmTerm);

  const resolve = useCallback(async (term, variant) => {
    setLoading(true);
    setError(null);
    setAiReasoning(null);
    setContent(null);

    if (variant === "generic") {
      setContent(DEFAULTS);
      setSourceType("generic");
      setLoading(false);
      return;
    }

    const staticResult = findStaticMatch(term);
    if (staticResult) {
      setContent(staticResult.match);
      setSourceType("static");
      setLoading(false);
      return;
    }

    // No static match — call Claude
    if (!term.trim()) {
      setContent(DEFAULTS);
      setSourceType("generic");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `You are a conversion copywriter for DealerAddendums.com — a SaaS platform used by 1,600+ car dealerships to print vehicle addendums, buyers guides, and info sheets since 2014. 2.3M+ addendums printed. Month-to-month, no contracts.

A visitor arrived via search term: "${term}"
Dealer type detected: "${dealerType}"
A/B variant strategy: "${variant}"

Generate hero copy matched to their search intent.

Respond ONLY with JSON:
{
  "headline": "max 8 words, directly relevant",
  "subheadline": "1 sentence benefit expansion",
  "cta": "3-5 word action",
  "socialProof": "short trust signal",
  "reasoning": "1 sentence why this converts"
}`,
          }],
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setContent(parsed);
      setAiReasoning(parsed.reasoning);
      setSourceType("ai");
    } catch (e) {
      setError("AI generation failed — check Anthropic API key.");
      setContent(DEFAULTS);
      setSourceType("generic");
    }
    setLoading(false);
  }, [dealerType]);

  // Resolve on mount and when inputs change
  useEffect(() => { resolve(utmTerm, abVariant); }, [utmTerm, abVariant]);

  const handleSearch = () => {
    setUtmTerm(termInput);
    resolve(termInput, abVariant);
  };

  // Generate all 3 variants for comparison
  const generateAllVariants = async () => {
    setAllVariants(null);
    const results = [];
    for (const v of AB_VARIANTS) {
      const staticResult = findStaticMatch(utmTerm);
      let content = DEFAULTS;
      let src = "generic";
      if (v.id !== "generic" && staticResult) {
        content = staticResult.match;
        src = "static";
      }
      // Simulate conversion rates (static/AI personalized > generic)
      const baseRate = v.id === "generic" ? 3.8 : staticResult ? 5.9 : 4.9;
      const rate = +(baseRate + (Math.random() * 0.8 - 0.4)).toFixed(2);
      const visitors = 1800 + Math.floor(Math.random() * 400);
      results.push({
        variant: v.id,
        content,
        source: src,
        rate,
        visitors,
        conversions: Math.round(visitors * rate / 100),
      });
    }
    setAllVariants(results);
    setActiveTab("compare");
  };

  const sourceLabel = { static: "Static Map", ai: "AI Generated", generic: "Default", cached: "Cached" };
  const sourceColor = { static: C.accent, ai: C.purple, generic: C.muted, cached: C.blue };

  return (
    <div style={{
      fontFamily: "'DM Mono', 'Fira Code', monospace",
      background: C.bg, minHeight: "100vh", color: C.text,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "0 24px", height: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
        background: C.bg + "f2", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: C.accent, color: C.bg, fontWeight: 900,
            fontSize: 10, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.1em" }}>DA</div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Personalization Engine</span>
          <Tag color={C.green}>Live Preview</Tag>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>middleware.ts + lib/personalization.ts</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", minHeight: "calc(100vh - 50px)" }}>

        {/* ── Left Panel: Controls ──────────────────────────── */}
        <div style={{
          borderRight: `1px solid ${C.border}`,
          padding: 20, display: "flex", flexDirection: "column", gap: 18,
          overflowY: "auto",
        }}>
          {/* UTM Term Input */}
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>
              Search Term (utm_term)
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={termInput}
                onChange={e => setTermInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="e.g. kia dealer addendum"
                style={{
                  flex: 1, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.text, padding: "7px 10px",
                  fontSize: 12, fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button onClick={handleSearch} style={{
                background: C.accent, color: C.bg, border: "none",
                borderRadius: 8, padding: "7px 12px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>→</button>
            </div>

            {/* Detected dealer type */}
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Detected type:</span>
              <Tag color={dealerType === "General" ? C.muted : C.orange}>{dealerType}</Tag>
            </div>
          </div>

          {/* Suggested terms */}
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>
              Suggested Terms
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {SUGGESTED_TERMS.map(t => (
                <button key={t} onClick={() => { setTermInput(t); setUtmTerm(t); }} style={{
                  background: utmTerm === t ? C.accent + "18" : C.surface,
                  border: `1px solid ${utmTerm === t ? C.accent + "55" : C.border}`,
                  borderRadius: 6, color: utmTerm === t ? C.accent : C.muted,
                  padding: "4px 8px", fontSize: 10, cursor: "pointer",
                  fontFamily: "inherit", transition: "all 0.15s",
                }}>{t}</button>
              ))}
            </div>
          </div>

          {/* A/B Variant Selector */}
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>
              A/B Variant (cookie-assigned)
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {AB_VARIANTS.map(v => (
                <button key={v.id} onClick={() => setAbVariant(v.id)} style={{
                  background: abVariant === v.id ? v.color + "15" : C.surface,
                  border: `1px solid ${abVariant === v.id ? v.color + "55" : C.border}`,
                  borderRadius: 8, padding: "10px 12px", cursor: "pointer",
                  textAlign: "left", transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 700,
                      color: abVariant === v.id ? v.color : C.text }}>{v.label}</span>
                    {abVariant === v.id && <Tag color={v.color}>active</Tag>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>{v.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution status */}
          {!loading && content && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: 14,
            }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
                letterSpacing: "0.08em", marginBottom: 10, fontWeight: 700 }}>
                Resolution Path
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {[
                  { step: "1. Middleware reads utm_term", done: true },
                  { step: "2. A/B variant assigned (cookie)", done: true },
                  { step: "3. Static map lookup", done: sourceType !== "ai", result: sourceType === "static" ? "HIT ✓" : "MISS" },
                  { step: "4. Claude API call", done: sourceType === "ai", result: sourceType === "ai" ? "Generated ✓" : "Skipped" },
                  { step: "5. Cache result (KV)", done: sourceType === "ai" },
                  { step: "6. Headers set, page renders", done: true },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between",
                    fontSize: 11, color: s.done ? C.text : C.muted + "88" }}>
                    <span>{s.step}</span>
                    {s.result && <span style={{ color: s.result.includes("HIT") || s.result.includes("Gen") ? C.green : C.muted }}>
                      {s.result}
                    </span>}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`,
                display: "flex", gap: 8, alignItems: "center" }}>
                <Glyph type={sourceType} />
                <span style={{ fontSize: 11, color: sourceColor[sourceType] }}>
                  {sourceLabel[sourceType]}
                </span>
                {sourceType === "ai" && (
                  <span style={{ fontSize: 10, color: C.muted }}>~400ms</span>
                )}
                {sourceType === "static" && (
                  <span style={{ fontSize: 10, color: C.muted }}>&lt;1ms</span>
                )}
              </div>
            </div>
          )}

          {/* Compare button */}
          <button onClick={generateAllVariants} style={{
            background: C.accent, color: C.bg, border: "none",
            borderRadius: 8, padding: "10px", fontSize: 12, fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.04em",
          }}>
            ⚖ Run A/B Comparison
          </button>
        </div>

        {/* ── Right Panel: Preview / Compare / Map ─────────── */}
        <div style={{ padding: 24, overflowY: "auto" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
            {[
              { id: "preview", label: "Live Preview" },
              { id: "compare", label: "A/B Compare" },
              { id: "map",     label: "Term Map" },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                background: activeTab === t.id ? C.accent + "18" : "none",
                border: `1px solid ${activeTab === t.id ? C.accent + "44" : C.border}`,
                borderRadius: 7, color: activeTab === t.id ? C.accent : C.muted,
                padding: "6px 14px", fontSize: 12, cursor: "pointer",
                fontFamily: "inherit", fontWeight: activeTab === t.id ? 700 : 400,
              }}>{t.label}</button>
            ))}
          </div>

          {/* Preview Tab */}
          {activeTab === "preview" && (
            <div style={{ display: "grid", gap: 16 }}>
              <HeroPreview content={content || DEFAULTS} variant={abVariant} loading={loading} dealerType={dealerType} />

              {/* AI reasoning */}
              {aiReasoning && !loading && (
                <div style={{
                  background: C.purple + "10", border: `1px solid ${C.purple}30`,
                  borderRadius: 10, padding: "12px 16px",
                  fontSize: 12, color: C.purple, lineHeight: 1.5,
                }}>
                  🤖 <strong>AI Reasoning:</strong> {aiReasoning}
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  background: C.red + "10", border: `1px solid ${C.red}30`,
                  borderRadius: 10, padding: "12px 16px", fontSize: 12, color: C.red,
                }}>{error}</div>
              )}

              {/* Copy details */}
              {content && !loading && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase",
                    letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>Generated Copy</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      ["Headline",    content.headline],
                      ["Subheadline", content.subheadline],
                      ["CTA",         content.cta],
                      ["Social Proof",content.socialProof],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compare Tab */}
          {activeTab === "compare" && (
            <div style={{ display: "grid", gap: 16 }}>
              {allVariants ? (
                <>
                  <ABCompare results={allVariants} />
                  <div style={{ display: "grid", gap: 12 }}>
                    {allVariants.map((v, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8,
                          display: "flex", gap: 8, alignItems: "center" }}>
                          <Tag color={{ generic: C.muted, personalized: C.accent, dealertype: C.purple }[v.variant]}>
                            {v.variant}
                          </Tag>
                          <Glyph type={v.source} />
                          <span>{sourceLabel[v.source]}</span>
                        </div>
                        <HeroPreview content={v.content} variant={v.variant} loading={false} dealerType={dealerType} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>⚖</div>
                  <div>Click "Run A/B Comparison" to see all 3 variants side by side</div>
                </div>
              )}
            </div>
          )}

          {/* Term Map Tab */}
          {activeTab === "map" && (
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>
                {Object.keys(STATIC_MAP).length} terms pre-mapped · Zero latency · No API call
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(STATIC_MAP).map(([term, val]) => (
                  <div key={term} onClick={() => { setTermInput(term); setUtmTerm(term); setActiveTab("preview"); }}
                    style={{
                      background: utmTerm === term ? C.accent + "10" : C.card,
                      border: `1px solid ${utmTerm === term ? C.accent + "44" : C.border}`,
                      borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                      transition: "all 0.15s",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: C.accent, fontFamily: "monospace" }}>{term}</span>
                      <Glyph type="static" />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{val.headline}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{val.subheadline}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
