// Dynamic Landing Engine — Phase 1 hero resolution + guardrailed generation.
//
// Server-only (Supabase + Anthropic). The render path NEVER awaits a Claude
// call: resolveHero() is cache-or-static, and generation happens out-of-band
// via warmHero() (triggered fire-and-forget from the client after paint).
//
// Safety model (auto-publish with no human gate):
//   1. Generation prompt is constrained to the approved brand corpus.
//   2. validateHeroRules() — deterministic lint: schema/lengths, banned
//      patterns, every number must exist in the corpus, ctaText/proofLine/
//      featuredBenefits must be VERBATIM members of the approved lists.
//   3. Secondary AI check (cheap model) tries to refute factual grounding.
//      Validator unavailable ⇒ fail closed (never publish unchecked copy).
//   4. Every attempt logged to generated_variations, pass or fail.
//   5. HERO_KILL_SWITCH=1 ⇒ everyone gets static. Daily budget cap ⇒ static.

import { anthropic, parseJSON } from '@/lib/ai'
import { supabase } from '@/lib/supabase'
import {
  FACTS, BENEFIT_OPTIONS, CTA_OPTIONS, PROOF_OPTIONS,
  BANNED_PATTERNS, ALLOWED_NUMBERS, corpusFactSheet, CORPUS_VERSION,
} from '@/lib/brand-corpus'
import { fnv1a, type VisitorSignals } from '@/lib/context-key'
import {
  STATIC_TERM_MAP, DEALERTYPE_COPY, GENERIC_COPY,
  type PersonalizationVariant,
} from '@/lib/personalization'

export interface HeroContent {
  headline: string
  subheadline: string
  ctaText: string
  proofLine: string
  featuredBenefits: string[]
}

export type HeroSource =
  | 'static-default'    // generic control / organic / fallback
  | 'static-term'       // curated STATIC_TERM_MAP exact match
  | 'static-dealertype' // curated DEALERTYPE_COPY (dealertype A/B arm)
  | 'cache'             // generated, validated, served from hero_cache
  | 'killed'            // kill switch active

export interface ResolvedHero {
  hero: HeroContent
  variationId: string
  source: HeroSource
  needsWarm: boolean // true ⇒ client should fire POST /api/personalize to warm the cache
}

export interface HeroTracking {
  contextKey: string
  variationId: string
  heroSource: HeroSource
  keyword: string
  dealerType: string
  abVariant: string
  layoutVariant: string
  headline: string
}

const GEN_MODEL = () => process.env.HERO_MODEL || 'claude-opus-4-8'
const VALIDATOR_MODEL = () => process.env.HERO_VALIDATOR_MODEL || 'claude-haiku-4-5'
const DAILY_BUDGET = () => parseInt(process.env.HERO_DAILY_GEN_BUDGET || '150', 10)
const CACHE_TTL_MIN = () => parseInt(process.env.HERO_CACHE_TTL_MINUTES || '360', 10)

export function killSwitchOn(): boolean {
  const v = (process.env.HERO_KILL_SWITCH || '').toLowerCase()
  return v === '1' || v === 'true' || v === 'on'
}

const DEFAULT_BENEFITS = [
  'Automatic inventory import',
  'FTC Buyers Guides in English & Spanish',
  'Month-to-month — no contracts',
]

export function getStaticHero(): HeroContent {
  return {
    headline: GENERIC_COPY.headline,
    subheadline: GENERIC_COPY.subheadline,
    ctaText: GENERIC_COPY.cta,
    proofLine: GENERIC_COPY.socialProof,
    featuredBenefits: DEFAULT_BENEFITS,
  }
}

function fromVariant(v: PersonalizationVariant): HeroContent {
  return {
    headline: v.headline,
    subheadline: v.subheadline,
    ctaText: v.cta,
    proofLine: v.socialProof,
    featuredBenefits: DEFAULT_BENEFITS,
  }
}

// ── Resolution (render path — DB read at most, never an AI call) ─────────────

export async function resolveHero(
  signals: VisitorSignals & { contextKey: string },
  abVariant: string,
  staticOverride?: { hero: HeroContent; variationId: string },
): Promise<ResolvedHero> {
  const staticHero = staticOverride ?? { hero: getStaticHero(), variationId: 'static-default' }
  const fallback: ResolvedHero = {
    hero: staticHero.hero,
    variationId: staticHero.variationId,
    source: 'static-default',
    needsWarm: false,
  }

  if (killSwitchOn()) return { ...fallback, source: 'killed' }

  // Organic / no ad keyword → strong static default, no generation.
  if (!signals.keyword) return fallback

  // 'generic' A/B arm is the measurement control — always static.
  if (abVariant === 'generic') return fallback

  // 'dealertype' arm keeps the curated per-segment copy (zero cost).
  if (abVariant === 'dealertype') {
    const v = DEALERTYPE_COPY[signals.dealerType] || DEALERTYPE_COPY['general']
    return {
      hero: fromVariant(v),
      variationId: `static-dealertype:${signals.dealerType}`,
      source: 'static-dealertype',
      needsWarm: false,
    }
  }

  // 'personalized' arm — engine path.
  // Curated exact-term copy beats generation (human-written, zero cost).
  const term = signals.keyword.toLowerCase().trim()
  const curated = STATIC_TERM_MAP[term]
  if (curated) {
    return {
      hero: fromVariant(curated),
      variationId: `static-term:${term}`,
      source: 'static-term',
      needsWarm: false,
    }
  }

  // Cache lookup — on any error, degrade to static (and still let the warm
  // endpoint try; it has its own error handling).
  try {
    const { data, error } = await supabase
      .from('hero_cache')
      .select('variation_id, hero, expires_at, hits')
      .eq('context_key', signals.contextKey)
      .maybeSingle()

    if (!error && data && new Date(data.expires_at).getTime() > Date.now()) {
      void supabase
        .from('hero_cache')
        .update({ hits: (data.hits ?? 0) + 1 })
        .eq('context_key', signals.contextKey)
        .then(() => {}, () => {})
      const hero = data.hero as HeroContent
      if (hero?.headline) {
        return { hero, variationId: data.variation_id, source: 'cache', needsWarm: false }
      }
    }
  } catch (e) {
    console.error('[hero-engine] cache read failed:', e instanceof Error ? e.message : e)
  }

  // Cold context → static now, warm in the background for the next visitor.
  return { ...fallback, needsWarm: true }
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateHeroRules(hero: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const h = hero as Partial<HeroContent> | null

  if (!h || typeof h !== 'object') return { ok: false, errors: ['not an object'] }

  for (const field of ['headline', 'subheadline', 'ctaText', 'proofLine'] as const) {
    if (typeof h[field] !== 'string' || !h[field]!.trim()) errors.push(`${field}: missing or empty`)
  }
  if (errors.length) return { ok: false, errors }

  if (h.headline!.length > 70) errors.push('headline: over 70 chars')
  if (h.headline!.split(/\s+/).length > 10) errors.push('headline: over 10 words')
  if (h.subheadline!.length > 180) errors.push('subheadline: over 180 chars')

  if (!CTA_OPTIONS.includes(h.ctaText!)) errors.push(`ctaText: "${h.ctaText}" not in approved CTA list`)
  if (!PROOF_OPTIONS.includes(h.proofLine!)) errors.push(`proofLine: "${h.proofLine}" not in approved proof list`)

  if (!Array.isArray(h.featuredBenefits) || h.featuredBenefits.length !== 3) {
    errors.push('featuredBenefits: must be exactly 3 items')
  } else {
    for (const b of h.featuredBenefits) {
      if (!BENEFIT_OPTIONS.includes(b)) errors.push(`featuredBenefits: "${b}" not in approved list`)
    }
    if (new Set(h.featuredBenefits).size !== 3) errors.push('featuredBenefits: duplicates')
  }

  const freeText = `${h.headline} ${h.subheadline}`
  for (const { pattern, reason } of BANNED_PATTERNS) {
    if (pattern.test(freeText)) errors.push(`banned: ${reason} (${pattern})`)
  }

  // Every number in the free text must exist in the corpus.
  for (const m of freeText.match(/\d[\d,]*(?:\.\d+)?/g) || []) {
    const n = m.replace(/,/g, '')
    if (!ALLOWED_NUMBERS.has(n)) errors.push(`number not in corpus: ${m}`)
  }

  return { ok: errors.length === 0, errors }
}

// Cheap secondary check: a small model tries to refute factual grounding.
// Any API failure ⇒ fail closed (copy is not published unchecked).
async function secondaryCheck(hero: HeroContent): Promise<{ ok: boolean; errors: string[] }> {
  try {
    const msg = await anthropic.messages.create({
      model: VALIDATOR_MODEL(),
      max_tokens: 300,
      system:
        'You are a strict brand-compliance checker for DealerAddendums.com. ' +
        'You receive an approved fact corpus and a generated hero. FAIL the hero ONLY if its headline ' +
        'or subheadline makes a factual claim (feature, integration, stat, price, legal/compliance ' +
        'claim) that is NOT supported by the corpus, mentions a competitor, or references the FTC ' +
        'CARS rule. Any fact stated anywhere in the corpus (including the APPROVED FACTS section) may ' +
        'be freely restated or rephrased in the hero — that is the corpus\'s purpose. Style, tone, and ' +
        'phrasing are never reasons to fail; only unsupported facts are. ' +
        'Respond ONLY with JSON: {"pass": true|false, "violations": ["..."]}',
      messages: [{
        role: 'user',
        content: `${corpusFactSheet()}\n\n== GENERATED HERO ==\n${JSON.stringify(hero, null, 2)}`,
      }],
    })
    const block = msg.content[0]
    const text = block.type === 'text' ? block.text : ''
    const verdict = parseJSON<{ pass: boolean; violations?: string[] }>(text)
    if (!verdict || typeof verdict.pass !== 'boolean') {
      return { ok: false, errors: ['secondary check: unparseable verdict'] }
    }
    return { ok: verdict.pass, errors: verdict.pass ? [] : (verdict.violations || ['secondary check failed']) }
  } catch (e) {
    return { ok: false, errors: [`secondary check unavailable: ${e instanceof Error ? e.message : 'error'}`] }
  }
}

// ── Generation (warm path — called from /api/personalize, never from render) ──

const inFlight = new Map<string, Promise<void>>()

export async function warmHero(signals: VisitorSignals & { contextKey: string }): Promise<
  { status: 'warmed' | 'skipped' | 'failed'; reason?: string }
> {
  if (killSwitchOn()) return { status: 'skipped', reason: 'kill_switch' }
  if (!signals.keyword) return { status: 'skipped', reason: 'no_keyword' }

  if (inFlight.has(signals.contextKey)) {
    return { status: 'skipped', reason: 'in_flight' }
  }

  // Already warm?
  const { data: existing } = await supabase
    .from('hero_cache')
    .select('context_key, expires_at')
    .eq('context_key', signals.contextKey)
    .maybeSingle()
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    return { status: 'skipped', reason: 'cached' }
  }

  // Daily generation budget — over budget (or unable to verify) ⇒ serve static.
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { count, error: countErr } = await supabase
    .from('generated_variations')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since.toISOString())
  if (countErr) return { status: 'skipped', reason: 'budget_unverifiable' }
  if ((count ?? 0) >= DAILY_BUDGET()) return { status: 'skipped', reason: 'budget_exceeded' }

  const job = generateAndPublish(signals)
  inFlight.set(signals.contextKey, job.then(() => {}, () => {}))
  try {
    return await job
  } finally {
    inFlight.delete(signals.contextKey)
  }
}

async function generateAndPublish(signals: VisitorSignals & { contextKey: string }): Promise<
  { status: 'warmed' | 'failed'; reason?: string }
> {
  const started = Date.now()
  const inputs = {
    keyword: signals.keyword,
    keywordCluster: signals.keywordCluster,
    dealerType: signals.dealerType,
    utmCampaign: signals.utmCampaign,
    device: signals.device,
    returning: signals.returning,
    corpusVersion: CORPUS_VERSION,
  }

  let hero: HeroContent | null = null
  let errors: string[] = []
  let pass = false

  try {
    const msg = await anthropic.messages.create({
      model: GEN_MODEL(),
      max_tokens: 600,
      system:
        'You write above-the-fold hero copy for DealerAddendums.com, a SaaS platform for car dealerships. ' +
        'You may ONLY use facts from the APPROVED BRAND CORPUS provided. HARD RULES, no exceptions: ' +
        '(1) never invent features, integrations, partners, or stats; ' +
        '(2) never mention competitors or make comparative claims; ' +
        '(3) never make legal or compliance claims beyond the corpus; ' +
        '(4) NEVER mention the FTC CARS rule — it was struck down and withdrawn; ' +
        '(5) use no numbers that do not appear verbatim in the corpus; ' +
        '(6) ctaText must be EXACTLY one string from the approved CTA list; ' +
        '(7) proofLine must be EXACTLY one string from the approved proof list; ' +
        '(8) featuredBenefits must be EXACTLY 3 distinct strings copied verbatim from the approved benefit list. ' +
        'Respond ONLY with JSON, no markdown.',
      messages: [{
        role: 'user',
        content:
          `${corpusFactSheet()}\n\n` +
          `== VISITOR CONTEXT ==\n` +
          `- Ad keyword cluster: ${signals.keywordCluster}\n` +
          `- Representative search: "${signals.keyword}"\n` +
          `- Dealer type: ${signals.dealerType}\n` +
          `- Device: ${signals.device}\n` +
          `- Returning visitor: ${signals.returning}\n` +
          `- Campaign: ${signals.utmCampaign || 'unknown'}\n\n` +
          `Write a hero precisely message-matched to this search intent (multiple visitors in this ` +
          `cluster will see it, so target the cluster theme, not a quirk of the exact query). ` +
          `IMPORTANT: if the search uses a product term the corpus does not (e.g. "window stickers", ` +
          `"hang tags"), do NOT adopt that term as a product claim — bridge to the corpus product ` +
          `names (addendums, FTC Buyers Guides, info sheets) while speaking to the same need. ` +
          `Headline: max 8 words, punchy, dealer-industry authentic. ` +
          `Subheadline: one sentence expanding the headline using only corpus facts.\n\n` +
          `JSON shape:\n` +
          `{"headline": "...", "subheadline": "...", "ctaText": "...", "proofLine": "...", "featuredBenefits": ["...", "...", "..."]}`,
      }],
    })
    const block = msg.content[0]
    const text = block.type === 'text' ? block.text : ''
    hero = parseJSON<HeroContent>(text)
    if (!hero) errors.push('generation: unparseable JSON')
  } catch (e) {
    errors.push(`generation failed: ${e instanceof Error ? e.message : 'error'}`)
  }

  if (hero) {
    const lint = validateHeroRules(hero)
    errors.push(...lint.errors)
    if (lint.ok) {
      const second = await secondaryCheck(hero)
      errors.push(...second.errors)
      pass = second.ok
    }
  }

  const variationId = hero ? `gen_${fnv1a(JSON.stringify(hero))}` : null

  // Audit log — every attempt, pass or fail. Best-effort but awaited so the
  // route can report failures.
  const { error: logErr } = await supabase.from('generated_variations').insert({
    context_key: signals.contextKey,
    variation_id: variationId,
    inputs,
    output: hero,
    model: GEN_MODEL(),
    validator_model: VALIDATOR_MODEL(),
    validation_pass: pass,
    validation_errors: errors.length ? errors : null,
    duration_ms: Date.now() - started,
    published: false,
  })
  if (logErr) console.error('[hero-engine] audit log insert failed:', logErr.message)

  if (!pass || !hero || !variationId) {
    return { status: 'failed', reason: errors[0] || 'validation failed' }
  }

  const expires = new Date(Date.now() + CACHE_TTL_MIN() * 60_000)
  const { error: cacheErr } = await supabase.from('hero_cache').upsert({
    context_key: signals.contextKey,
    variation_id: variationId,
    hero,
    signals: inputs,
    created_at: new Date().toISOString(),
    expires_at: expires.toISOString(),
    hits: 0,
  })
  if (cacheErr) {
    console.error('[hero-engine] cache write failed:', cacheErr.message)
    return { status: 'failed', reason: 'cache write failed' }
  }

  void supabase
    .from('generated_variations')
    .update({ published: true })
    .eq('variation_id', variationId)
    .eq('context_key', signals.contextKey)
    .then(() => {}, () => {})

  return { status: 'warmed' }
}
