// The hero rotator's image shape + the hardcoded fallback set. Plain module
// (no 'use client') so both server code (the hero_slides fetch helper) and the
// client rotator can import it.

export type HeroAddendumImage = { src: string; alt: string }

// Fallback ONLY: the live set comes from the hero_slides table (admin → Hero
// Slides). This set renders when the table is empty or unreachable, so the
// hero is never blank. Order: Van Nuys → BMW → Lithia → Harbor.
export const HERO_ADDENDUM_FALLBACK: HeroAddendumImage[] = [
  { src: '/hero/addendum-honda-vannuys.png', alt: 'Honda of Van Nuys vehicle addendum printed with DealerAddendums' },
  { src: '/hero/addendum-bmw-dallas.png', alt: 'BMW of Dallas vehicle addendum printed with DealerAddendums' },
  { src: '/hero/addendum-lithia-boise.png', alt: 'Lithia of Boise vehicle addendum printed with DealerAddendums' },
  { src: '/hero/addendum-harbor-honda.png', alt: 'Harbor Honda vehicle addendum printed with DealerAddendums' },
]
