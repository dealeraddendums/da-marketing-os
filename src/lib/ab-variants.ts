// A/B variant whitelists — the single source of truth for which variant ids
// exist. Added 2026-11-15 after a scanner burst (Oct 26) persisted SQL-probe
// strings as ab_events.ab_variant "variants": every place a variant name/id
// arrives from the request (cookie, header, or POST body) must validate
// against these sets; anything else falls back to control and is NOT written.
//
// Pure module (no supabase import) so middleware (edge runtime) can use it.

/** The hero copy test's defined arms. */
export const HERO_VARIANTS = ['generic', 'personalized', 'dealertype'] as const
export type HeroVariant = (typeof HERO_VARIANTS)[number]

/** Control arm — what an unrecognized variant value falls back to. */
export const HERO_CONTROL: HeroVariant = 'generic'

export function parseHeroVariant(v: string | undefined | null): HeroVariant | null {
  return (HERO_VARIANTS as readonly string[]).includes(v || '') ? (v as HeroVariant) : null
}

/**
 * Everything ab_events.ab_variant may legitimately hold: the hero arms plus
 * 'home-b' (the Home B page's server-built tracking object deliberately tags
 * its events home-b to keep them out of the hero copy test arms).
 */
export const AB_EVENT_VARIANTS = [...HERO_VARIANTS, 'home-b'] as const

/** Everything ab_events.layout_variant may hold ('a' = parked LayoutA test). */
export const AB_LAYOUT_VARIANTS = ['a', 'b', 'home-b'] as const

/** The funnel event vocabulary — every abTrackOnce/ab-track call site. */
export const AB_EVENT_TYPES = [
  'hero_impression',
  'engaged_30s',
  'pricing_view',
  'form_start',
  'conversion',
  'trial_start',
] as const

export function inSet(v: string | undefined | null, set: readonly string[]): string | null {
  return set.includes(v || '') ? (v as string) : null
}
