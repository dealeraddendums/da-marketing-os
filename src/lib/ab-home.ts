// Home B layout A/B test — shared plumbing.
//
// The experiment: the existing homepage is variant A (the default and the
// control), the ChatGPT-designed `src/components/home-b/` page is variant B.
// middleware.ts assigns the bucket server-side (cookie `da_ab_home`, request
// header `x-ab-home`) so there is no client-side flicker; this module owns the
// names, the env knob, and the first-party counters the admin card reads.
//
// Flip the split by setting AB_HOME_B_PCT (0–100) in .env.production on the
// box and restarting PM2. 0 (the default) = everyone gets A; the override
// /?variant=B still works for previewing.

import { supabase } from '@/lib/supabase'

export type AbHomeBucket = 'A' | 'B'

export const AB_HOME_COOKIE = 'da_ab_home'
/** Request header middleware sets for the page to read via headers(). */
export const AB_HOME_HEADER = 'x-ab-home'
/** Set to '1' by middleware ONLY on the request that first assigned a bucket
 *  (not on bot traffic, not on ?variant= previews, not on returning visitors)
 *  — the page increments the first-party "visitors" counter off it. */
export const AB_HOME_NEW_HEADER = 'x-ab-home-new'
export const AB_HOME_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function parseBucket(v: string | undefined | null): AbHomeBucket | null {
  return v === 'A' || v === 'B' ? v : null
}

/** AB_HOME_B_PCT, clamped to 0–100; anything unparseable = 0 (all-A). */
export function abHomeBPct(): number {
  const n = parseInt(process.env.AB_HOME_B_PCT || '0', 10)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
}

/**
 * First-party counter (table `ab_home_stats`, migration 027). Atomic via the
 * `increment_ab_home_stat` SQL function; fire-and-forget and swallow-on-error
 * everywhere — analytics must never break a page or a signup, and before the
 * migration is applied this simply logs once per call and moves on.
 */
export async function incrementAbHomeStat(
  bucket: AbHomeBucket,
  metric: 'visitors' | 'form_start',
): Promise<void> {
  try {
    const { error } = await supabase.rpc('increment_ab_home_stat', {
      p_bucket: bucket,
      p_metric: metric,
    })
    if (error) console.warn(`[ab-home] stat ${metric}/${bucket} not recorded: ${error.message}`)
  } catch (e) {
    console.warn('[ab-home] stat increment failed:', e instanceof Error ? e.message : e)
  }
}
