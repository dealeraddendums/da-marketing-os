// Hero slider slides — server-side read for the homepage.
//
// The homepage is force-dynamic (personalization reads cookies/headers), so
// plain ISR doesn't apply; unstable_cache gives the same effect for this one
// read: at most one Supabase query per 60s across all requests, and the
// admin APIs call revalidateTag('hero-slides') on every write so edits show
// up on the next request, not just within a minute.

import { unstable_cache } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { HERO_ADDENDUM_FALLBACK, type HeroAddendumImage } from '@/lib/hero-addendum-images'

export interface HeroSlide {
  id: string
  sort_order: number
  title: string
  description: string
  image_path: string
  is_active: boolean
}

export const HERO_SLIDES_TAG = 'hero-slides'
export const MAX_ACTIVE_SLIDES = 4

async function fetchActiveHeroSlides(): Promise<HeroSlide[]> {
  try {
    const { data, error } = await supabase
      .from('hero_slides')
      .select('id, sort_order, title, description, image_path, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(MAX_ACTIVE_SLIDES)
    if (error || !data) return []
    return data as HeroSlide[]
  } catch {
    // Table missing / DB hiccup → empty; the hero falls back to its static
    // image pair, never a broken page.
    return []
  }
}

export const getActiveHeroSlides = unstable_cache(
  fetchActiveHeroSlides,
  ['hero-slides-active'],
  { revalidate: 60, tags: [HERO_SLIDES_TAG] },
)

// The hero rotator's image set on BOTH homepages (A's hero and Home B's hero),
// admin-managed via the Hero Slides tab. Alt text = "{title} {description}"
// (seeded as "{Dealer}" + "vehicle addendum printed with DealerAddendums").
// Empty table or a DB hiccup → the hardcoded four, never an empty hero.
// Same 60s cache + tag revalidation as getActiveHeroSlides, so an admin edit
// shows on both variants within a minute without a deploy.
export async function getHeroAddendumImages(): Promise<HeroAddendumImage[]> {
  const slides = await getActiveHeroSlides()
  const images = slides
    .filter(s => typeof s.image_path === 'string' && s.image_path.length > 0)
    .map(s => ({
      src: s.image_path,
      alt: [s.title, s.description].filter(Boolean).join(' ').trim()
        || 'Vehicle addendum printed with DealerAddendums',
    }))
  return images.length > 0 ? images : HERO_ADDENDUM_FALLBACK
}
