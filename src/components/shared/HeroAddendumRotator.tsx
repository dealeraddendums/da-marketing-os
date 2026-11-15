'use client'

// Shared hero addendum rotator — the SAME four real dealer addendums cycle on
// both homepages (A's hero and Home B's hero). All slides mount inside one
// fixed-aspect frame (the scans are all 1200×3069), cross-fading 600ms, so a
// slide change can never shift layout. Styling of the card frame (tilt,
// shadow, ring, width) belongs to each hero's wrapper — this component only
// owns the frame's aspect ratio and the fade.

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

export type HeroAddendumImage = { src: string; alt: string }

// Rotation order: Van Nuys → BMW → Lithia → Harbor.
export const HERO_ADDENDUM_IMAGES: HeroAddendumImage[] = [
  { src: '/hero/addendum-honda-vannuys.png', alt: 'Honda of Van Nuys vehicle addendum printed with DealerAddendums' },
  { src: '/hero/addendum-bmw-dallas.png', alt: 'BMW of Dallas vehicle addendum printed with DealerAddendums' },
  { src: '/hero/addendum-lithia-boise.png', alt: 'Lithia of Boise vehicle addendum printed with DealerAddendums' },
  { src: '/hero/addendum-harbor-honda.png', alt: 'Harbor Honda vehicle addendum printed with DealerAddendums' },
]

type Props = {
  images: HeroAddendumImage[]
  intervalMs?: number
  /** next/image responsive sizes for the rendered card width */
  sizes?: string
  /** corner radius of the clipping frame */
  radius?: number
}

export default function HeroAddendumRotator({ images, intervalMs = 4500, sizes, radius = 6 }: Props) {
  const [active, setActive] = useState(0)
  const [reduced, setReduced] = useState(false)
  const hovered = useRef(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    if (reduced || images.length < 2) return
    const id = setInterval(() => {
      // Pause (hold the current slide) while hovered or while the tab is hidden.
      if (hovered.current || document.hidden) return
      setActive(a => (a + 1) % images.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [reduced, images.length, intervalMs])

  // Reduced motion: the first image only, static.
  const shown = reduced ? images.slice(0, 1) : images

  return (
    <div
      onMouseEnter={() => { hovered.current = true }}
      onMouseLeave={() => { hovered.current = false }}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1200 / 3069',
        background: '#ffffff',
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      {shown.map((img, i) => (
        <Image
          key={img.src}
          src={img.src}
          alt={img.alt}
          fill
          priority={i === 0}
          loading={i === 0 ? undefined : 'lazy'}
          sizes={sizes}
          aria-hidden={i !== active}
          style={{
            objectFit: 'cover',
            opacity: i === active ? 1 : 0,
            transition: 'opacity 600ms ease',
          }}
        />
      ))}
    </div>
  )
}
