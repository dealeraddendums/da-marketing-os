# DA-Marketing-OS — Message Reshape (Trust-Led)

> Owner: Allan. Created 2026-06-22. Reposition the **full marketing site** (NOT the da-platform app)
> from a volume/profit framing to a **trust-led** message with **compliance/transparency as the
> backbone** — a direct response to the FTC deceptive-pricing pressure (see `AutoWarningLetter.pdf` +
> the regulatory read). Goal: win back the spooked dealers and make DA the obviously-responsible choice.
> Decisions (Allan, 2026-06-22): **trust-led, compliance as support**; **full marketing site**; da-platform untouched.

## The pivot
- **FROM:** "Unlimited addendums · *Total Addendum Value* · what you add per car" — volume + the dollars
  you tack on, which now reads like the exact thing the FTC warns about (hidden markup / price you don't show).
- **TO:** **"Present your dealer-added value the right way — transparent, professional, trusted."**
  Trust + professionalism lead; FTC-aligned transparency/compliance is the reassuring backbone, not a
  fear-first headline.

## Positioning statement
*DealerAddendums is how modern dealers present dealer-added value with full transparency — clear,
itemized, professionally branded addendums that show customers the true price, build trust, and keep
your pricing defensible.* (Transparency/compliance = the spine; trust/professionalism = the face.)

## Trust-led pillars
1. **Build customer trust** — a clean, branded, itemized addendum tells buyers exactly what they're
   getting and why. Transparency that earns the sale.
2. **Show the true price** — every dealer-installed item disclosed clearly; the price they see is the
   price you stand behind.
3. **Compliant & defensible** *(backbone, not the lead)* — in an era of FTC scrutiny on auto pricing, a
   transparent, itemized addendum is your disclosure record, not your exposure.
4. **Professional & effortless** — consistent, branded disclosure across your whole lot in seconds
   (platform benefits, reframed around transparency — not markup).

## Tone — do / don't
- **DO:** transparent · true price · disclose · itemized · professional · trusted · customer confidence
  · defensible · compliant · clarity.
- **DON'T (retire from all copy):** maximize gross · markup · "more profit / more money per car" ·
  squeeze · hidden · "boost your bottom line" · "add value" used as a dollars euphemism. These now read
  as deceptive-pricing red flags.

## Hero-engine corpus reshape — highest leverage (governs every dynamic hero)
`src/lib/hero-engine.ts` AI-generates heroes against approved lists + a generic fallback, with a
validator. Reshape the *inputs* (not the engine):
- **GENERIC_COPY** (default headline/subheadline/cta/socialProof) → trust-led (examples below).
- **BENEFIT_OPTIONS / DEFAULT_BENEFITS** → trust/transparency/professional benefits; remove any
  profit/markup/value-$ ones.
- **PROOF_OPTIONS** → credibility proof (dealers served, years, transparency) — not "$ added."
- **CTA_OPTIONS** → keep neutral/positive ("Start free," "See it in action").
- **The AI hero-gen prompt + validator corpus** → instruct the model to write trust/transparency/
  professional copy and **explicitly forbid gross/markup/"more profit" framing.** Critical — otherwise
  the generator keeps producing the old message.

Example trust-led headlines (validator allows ≤10 words / ≤70 chars):
- "Show every customer the true price."
- "Dealer-added value, clearly disclosed."
- "The professional way to present your addendums."
- "Build trust at the point of sale."

Example subheadline: *"Clear, itemized, branded addendums that show buyers exactly what they're getting —
and keep your pricing transparent and defensible."*

## Surface-by-surface (the full site)
1. **Hero engine** (above) — corpus + gen guidance. **Do this first**; it drives the most copy.
2. **Homepage components** (`src/components/marketing/*` — HeroSection, FeaturesSection, PricingSection,
   TestimonialsSection, CTASection, LayoutA): reshape copy to the pillars.
   - ⚠️ **Reframe the "Total Addendum Value" / "Addendum Value Tracked" stat** (LayoutA + TestimonialsSection)
     — it reads as "the markup you can add," the most FTC-coded element on the site. Replace with a
     trust/volume-neutral metric: **"Addendums printed," "Dealers served," "Years serving dealers."**
3. **Landing pages** (`content/lp/*.mdx` — ford-dealers, kia-dealers, used-car-dealers): rewrite the
   `headline`/`subheadline` frontmatter to trust-led, per segment.
4. **Blog / SEO** (`content/posts/*`): you already have compliance-leaning posts
   (`franchise-dealer-compliance-checklist`, `ftc-buyers-guide-requirements-2026`,
   `window-sticker-vs-addendum`) — lean in. Retune toward "FTC pricing transparency & addendums," "the
   right way to disclose dealer-installed options," "how a transparent addendum protects your store."
   Preserve SEO value (keep slugs/keywords; shift the angle).
5. **Trial / CTA / onboarding copy** (CTASection): tone-align to transparency/professional; keep the
   already-corrected trial terms (30-vehicle cap; one-time 25-label shipment on request).

## Out of scope
- **da-platform (the app) — untouched.** Marketing-site messaging only.
- The separate "reposition DA *itself* as a compliance/transparency tool" (in-app) is a different,
  optional task from the FTC-hedge discussion — not part of this.

## Verify
- The hero generator + approved lists never produce gross/markup/"more profit" framing; trust/
  transparency/compliance throughout.
- The "addendum value $" stat is reframed everywhere it appears.
- Homepage, LPs, blog, CTA all read trust-led and consistent; the A/B + dynamic hero engine still
  function (this is a corpus/content swap, not an engine change).
