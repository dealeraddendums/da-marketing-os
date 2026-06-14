// ============================================================================
// BRAND CORPUS — the ONLY facts the hero generator may use.
//
// ✅ STATUS: REVIEWED AND LOCKED by Allan 2026-06-12.
// Review outcomes baked in:
// - Trial is 30 days / up to 30 vehicles printed, no credit card — the
//   generator MAY state this length.
// - Big stats are stated ROUNDED with a "+" so copy never goes stale:
//   3.6 million+ addendums (actual 3,596,230), $800 million+ value (actual
//   $800,832,000), 1,600+ dealerships. Precise frozen figures removed.
// - "526 addendums printed today" removed — live daily counter, not a fact.
// - Label pricing confirmed by Allan 2026-06-12: 22–30¢ each by quantity. The
//   corpus carries ONLY the floor ("as low as $0.22 — volume pricing") so the
//   generator can never quote the 30¢ high end; the static PricingSection may
//   show the full range. (2026-06-14: "25 free labels" reframed as a TRIAL
//   one-time on-request shipment, not a plan feature; trial is capped at 30
//   vehicle addendums — "unlimited" applies to PAID plans only.)
// - Pricing $100/$150/$200 and the named dealer groups confirmed as-is.
//
// Product-messaging revision (Allan, 2026-06-12, v .3):
// - SMS/QR Lead Capture REMOVED — no longer offered. Never mention it.
// - DA Installer iOS app is now INCLUDED — no $10/mo charge exists.
// - Exactly ONE paid add-on: Color-Matched Vehicle Images, +$50/month. It is
//   intentionally NOT in BENEFIT_OPTIONS — it must never read as included.
// - New features: Magic Button (VDP), Combo Addendum (Required vs Suggested),
//   any-provider automatic inventory, rules-based product assignment.
// - Compliance framing: transparency / clear disclosure; the FTC Buyers Guide
//   may be referenced (still valid). Never the CARS rule; never claim the
//   product "makes you FTC-compliant" — it "supports compliant, transparent
//   disclosures."
//
// HARD BANS (enforced by prompt + validator, listed here as the contract):
// - No inventing features, integrations, or partners
// - No competitor names or comparative claims
// - No legal/compliance claims beyond what is written here
// - NEVER cite the FTC CARS rule — struck down Jan 2025, withdrawn Feb 2026
// - No numbers that do not appear in this file
// ============================================================================

export const CORPUS_VERSION = '2026-06-14.1' // bump when facts change
export const CORPUS_REVIEWED_BY: string | null = 'allan' // reviewed 2026-06-12

// Free-form facts the generator may draw on for headlines/subheadlines.
export const FACTS: string[] = [
  // What the product is
  'DealerAddendums is a SaaS platform car dealerships use to print vehicle addendums, FTC Buyers Guides, and info sheets.',
  'Print professional, branded vehicle addendums in seconds from a computer, tablet, or the iOS app.',
  'Automatic inventory from any website provider, syndication company, or DMS — your lot syncs itself, no manual VIN entry.',
  'Set a product once with rules — make, model, trim, year, body style, mileage, fuel type — and it auto-applies to every matching vehicle; new inventory is addended automatically.',
  'Automatic inventory + rules-based products mean addendums build themselves — virtually eliminating manual-entry human error.',
  'FTC Buyers Guides: As-Is, Implied, or Warranty, in English and Spanish, printed in one click.',
  'Pre-Owned and CPO Vehicle Information Sheets with dealer logo, vehicle details, description, options, QR code, and optional price.',
  'The DA Installer iOS app — scan VINs, QR codes, or barcodes and create, manage, and print addendums from the lot — is included with every plan.',
  'Magic Button: embed a one-click Magic Button on your VDP (vehicle detail page) that shows shoppers the exact PDF addendum from the lot — your online listing carries the same disclosures as the printed sticker, supporting compliant, transparent disclosure.',
  'Combo Addendum: one addendum that clearly separates Required add-ons from Suggested (optional) ones, so buyers see what is mandatory vs optional at a glance — clear, transparent disclosure.',
  'AI CarDescriptions tool generates SEO-compliant vehicle descriptions automatically for every unit on the lot.',
  '2-way inventory sync: inventory is pulled automatically and addendum data is pushed back to the dealer website and syndication partners.',
  'Color-Matched Vehicle Images: show a stock photo matched to each vehicle\'s actual color right on the addendum ($50/month add-on).',
  'Multi-rooftop group accounts: manage all locations from one account with group discounts and consistent branding.',
  'Custom branding: dealership logo, pricing, and watermarks on every document; hard-add and soft-add templates available.',
  'Brand-specific addendum templates (e.g. Kia, Ford, Toyota, Honda, Chevrolet, Nissan) with the dealer\'s own logo, products, and pricing.',
  // Stats / trust (rounded with "+" per Allan 2026-06-12 so copy never goes stale)
  'Trusted by 1,600+ active dealerships.',
  'In business since 2014.',
  '3.6 million+ addendums printed.',
  '$800 million+ in addendum value printed.',
  '32,000+ updates driven by dealer feedback.',
  'Addendums print in under 30 seconds.',
  'Used by franchise and independent dealers nationwide.',
  'Dealer groups using DealerAddendums include Lithia Motors, Larry H. Miller Automotive, Asbury Automotive Group, Sonic Automotive, Berkshire Hathaway Automotive, and Ken Garff Automotive Group.',
  // Pricing (confirmed by Allan — exact figures only)
  'Plans: Trial/Manual Load $100/month, Automatic — Web $150/month (most popular), Automatic — DMS $200/month.',
  'The only paid add-on is Color-Matched Vehicle Images at +$50/month; everything else, including the iOS app, is included.',
  'Free trial includes a one-time shipment of 25 addendum labels (on request).',
  'Labels as low as $0.22 each — volume pricing (for paid label orders).',
  '30-day free trial — print up to 30 vehicle addendums, no credit card required.',
  'Month-to-month. No contracts. No setup fees. Cancel anytime.',
  'US-based support; 24/7 support.',
  'Up and running in minutes.',
]

// featuredBenefits[] must be selected VERBATIM from this list (validator
// enforces exact membership) — short strings that render as checkmarks.
export const BENEFIT_OPTIONS: string[] = [
  'Unlimited addendums',
  'Automatic inventory import',
  'Auto inventory from any provider, syndication, or DMS',
  'Rules-based product assignment',
  'Magic Button for your VDP',
  'Combo Addendum — Required & Suggested',
  'FTC Buyers Guides in English & Spanish',
  'CPO & pre-owned info sheets',
  'Custom logo, branding & watermarks',
  'Print from desktop, tablet, or iOS app',
  'iOS DA Installer app included',
  'Auto-applies products by year, make, model & trim',
  'AI vehicle descriptions',
  '2-way inventory sync',
  'Multi-rooftop group discounts',
  'Brand-ready franchise templates',
  'Month-to-month — no contracts',
  'No setup fees',
  'US-based 24/7 support',
  'Up and running in minutes',
  'Free trial: 25 addendum labels (one-time, on request)',
]
// NOTE: 'Color-Matched Vehicle Images' is deliberately NOT a benefit option —
// it is the paid add-on and must never render as an included checkmark.
// NOTE: '25 free labels' is a TRIAL one-time perk, not a plan feature — the
// benefit string above is scoped to the trial; never list it as a paid-plan
// included feature.

// ctaText must be one of these, verbatim. All hero CTAs link to #signup.
export const CTA_OPTIONS: string[] = [
  'Start Free Trial',
  'Start Your Free Trial',
  'Try It Free',
  'Get Started Free',
  'See How It Works',
  'See Compliance Features',
  'Talk to Sales',
]

// proofLine must be one of these, verbatim.
export const PROOF_OPTIONS: string[] = [
  'Trusted by 1,600+ dealerships since 2014',
  '3.6M+ addendums printed',
  '$800M+ in addendum value printed',
  '30-day free trial — no credit card required',
  'Month-to-month. Cancel anytime.',
  'No credit card required',
  'Used by franchise and independent dealers nationwide',
  'Compliance-first since 2014',
  '32,000+ updates driven by dealer feedback',
  'Virtually eliminates manual-entry error',
]

// Regexes that hard-fail validation when matched in any generated field.
export const BANNED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /cars\s+rule/i, reason: 'FTC CARS rule is dead — never cite it' },
  { pattern: /combating\s+auto\s+retail\s+scams/i, reason: 'FTC CARS rule is dead — never cite it' },
  { pattern: /\bcars\s+act\b/i, reason: 'FTC CARS rule is dead — never cite it' },
  { pattern: /guarantee/i, reason: 'no guarantees of outcomes' },
  { pattern: /\b(vs\.?|versus)\b/i, reason: 'no competitor comparisons' },
  { pattern: /reynolds|frazer|dealertrack|cdk|vauto|carfax/i, reason: 'no competitor names' },
  { pattern: /avoid\s+(fines|lawsuits|penalties)/i, reason: 'no legal-outcome claims' },
  { pattern: /[<>{}[\]]|https?:/i, reason: 'no markup or links in hero copy' },
]

// Every numeric token in generated copy must appear in this set (built from
// the corpus text, so adding a fact automatically allows its numbers).
function extractNumbers(texts: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of texts) {
    for (const m of t.match(/\d[\d,]*(?:\.\d+)?/g) || []) {
      out.add(m.replace(/,/g, ''))
    }
  }
  return out
}

export const ALLOWED_NUMBERS: Set<string> = extractNumbers([
  ...FACTS,
  ...BENEFIT_OPTIONS,
  ...PROOF_OPTIONS,
])

// One flat fact sheet for prompts (generation + secondary validation).
export function corpusFactSheet(): string {
  return [
    '== APPROVED FACTS ==',
    ...FACTS.map(f => `- ${f}`),
    '',
    '== APPROVED BENEFIT STRINGS (featuredBenefits must be copied verbatim from this list) ==',
    ...BENEFIT_OPTIONS.map(b => `- ${b}`),
    '',
    '== APPROVED CTA STRINGS (ctaText must be exactly one of these) ==',
    ...CTA_OPTIONS.map(c => `- ${c}`),
    '',
    '== APPROVED PROOF LINES (proofLine must be exactly one of these) ==',
    ...PROOF_OPTIONS.map(p => `- ${p}`),
  ].join('\n')
}
