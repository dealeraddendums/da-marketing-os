// ============================================================================
// BRAND CORPUS — the ONLY facts the hero generator may use.
//
// ⚠️ STATUS: PENDING ALLAN'S REVIEW (seeded 2026-06-11 by Claude Code).
// Every line below was lifted verbatim-or-near-verbatim from copy already on
// the new marketing site (HeroSection, FeaturesSection, PricingSection,
// CTASection, LayoutA, lib/personalization.ts). Nothing was invented — but
// Allan/Marlena should vet each fact before real ad traffic hits the engine,
// because generated copy auto-publishes with no human gate.
//
// Known inconsistency to resolve at review: CTASection says "14-day free
// trial" while the DA Platform account lifecycle is 30 days / 30 vehicles.
// The corpus therefore says "free trial" with NO duration — the generator is
// not allowed to emit a trial length until Allan picks one.
//
// HARD BANS (enforced by prompt + validator, listed here as the contract):
// - No inventing features, integrations, or partners
// - No competitor names or comparative claims
// - No legal/compliance claims beyond what is written here
// - NEVER cite the FTC CARS rule — struck down Jan 2025, withdrawn Feb 2026
// - No numbers that do not appear in this file
// ============================================================================

export const CORPUS_VERSION = '2026-06-11.1' // bump when facts change
export const CORPUS_REVIEWED_BY: string | null = null // set to 'allan' after review

// Free-form facts the generator may draw on for headlines/subheadlines.
export const FACTS: string[] = [
  // What the product is
  'DealerAddendums is a SaaS platform car dealerships use to print vehicle addendums, FTC Buyers Guides, and info sheets.',
  'Print professional, branded vehicle addendums in seconds from a computer, tablet, or the iOS app.',
  'Auto-applies products based on year, make, model, trim, bodystyle, and mileage — set it once, done forever.',
  'FTC Buyers Guides: As-Is, Implied, or Warranty, in English and Spanish, printed in one click.',
  'Pre-Owned and CPO Vehicle Information Sheets with dealer logo, vehicle details, description, options, QR code, and optional price.',
  'The DA Installer iOS app lets staff scan VINs, QR codes, or barcodes and create, manage, and print addendums from the lot ($10/mo add-on).',
  'SMS lead capture: QR codes on every addendum direct buyers to the VDP and capture name, phone, and vehicle of interest automatically ($50/mo add-on).',
  'AI CarDescriptions tool generates SEO-compliant vehicle descriptions automatically for every unit on the lot.',
  '2-way inventory sync: inventory is pulled automatically and addendum data is pushed back to the dealer website and syndication partners.',
  'Multi-rooftop group accounts: manage all locations from one account with group discounts and consistent branding.',
  'Custom branding: dealership logo, pricing, and watermarks on every document; hard-add and soft-add templates available.',
  'Brand-specific addendum templates (e.g. Kia, Ford, Toyota, Honda, Chevrolet, Nissan) with the dealer\'s own logo, products, and pricing.',
  // Stats / trust (verbatim from the live hero/stat cards)
  'Trusted by 1,644 active dealerships (1,600+).',
  'In business since 2014.',
  'Over 2.3 million addendums printed (2,347,023 total).',
  '$993M+ in addendum value printed.',
  '526 addendums printed today.',
  '32,000+ updates driven by dealer feedback.',
  'Addendums print in under 30 seconds.',
  'Used by franchise and independent dealers nationwide.',
  'Dealer groups using DealerAddendums include Lithia Motors, Larry H. Miller Automotive, Asbury Automotive Group, Sonic Automotive, Berkshire Hathaway Automotive, and Ken Garff Automotive Group.',
  // Pricing (from PricingSection — exact figures only)
  'Plans: Trial/Manual Load $100/month, Automatic — Web $150/month (most popular), Automatic — DMS $200/month.',
  'iOS DA Installer App add-on +$10/month; SMS/QR Lead Capture add-on +$50/month.',
  'Labels from $0.22 each; 25 free labels included on the entry plan.',
  'Free trial — no credit card required. (Do NOT state a trial length; under review.)',
  'Month-to-month. No contracts. No setup fees. Cancel anytime.',
  'US-based support; 24/7 support.',
  'Up and running in minutes.',
]

// featuredBenefits[] must be selected VERBATIM from this list (validator
// enforces exact membership) — short strings that render as checkmarks.
export const BENEFIT_OPTIONS: string[] = [
  'Unlimited addendums',
  'Automatic inventory import',
  'FTC Buyers Guides in English & Spanish',
  'CPO & pre-owned info sheets',
  'Custom logo, branding & watermarks',
  'Print from desktop, tablet, or iOS app',
  'Auto-applies products by year, make, model & trim',
  'QR code SMS lead capture',
  'AI vehicle descriptions',
  '2-way inventory sync',
  'Multi-rooftop group discounts',
  'Brand-ready franchise templates',
  'Month-to-month — no contracts',
  'No setup fees',
  'US-based 24/7 support',
  'Up and running in minutes',
  '25 free labels included',
]

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
  'Trusted by 1,644 dealerships since 2014',
  '2.3M+ addendums printed',
  '$993M+ in addendum value printed',
  '526 addendums printed today',
  'Month-to-month. Cancel anytime.',
  'No credit card required',
  'Used by franchise and independent dealers nationwide',
  'Compliance-first since 2014',
  '32,000+ updates driven by dealer feedback',
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
