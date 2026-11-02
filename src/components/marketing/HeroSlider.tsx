'use client'
// Hero addendum slider — one addendum image at a time with its title and
// description beside it (image left / text right on desktop, image above text
// on mobile; layout classes live in globals.css).
//
// Behavior: auto-advance every 6s; paused on hover, focus, and touch; prev/
// next arrows; dot indicators; swipe; keyboard arrows; prefers-reduced-motion
// disables auto-advance and the crossfade. The image sits in a FIXED
// aspect-ratio frame (matches the 760×1968 addendum scans) so slides change
// with zero layout shift; the first slide uses next/image priority (LCP), the
// rest mount lazily as they're needed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'

export interface HeroSliderSlide {
  id: string
  title: string
  description: string
  image_path: string
}

const ADVANCE_MS = 6000

export default function HeroSlider({ slides }: { slides: HeroSliderSlide[] }) {
  const count = slides.length
  const [active, setActive] = useState(0)
  // Only mounted slides render an <Image>; starts with just the first so the
  // LCP request is the only hero image on first paint.
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]))
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  const goTo = useCallback((i: number) => {
    if (count < 2) return
    const next = ((i % count) + count) % count
    setActive(next)
    setMounted(prev => {
      const n = new Set(prev)
      n.add(next)
      n.add((next + 1) % count) // pre-mount the upcoming slide
      return n
    })
  }, [count])

  // After hydration, pre-mount slide 2 so the first advance isn't blank.
  useEffect(() => {
    if (count > 1) {
      const t = setTimeout(() => {
        setMounted(prev => {
          if (prev.has(1)) return prev
          const n = new Set(prev)
          n.add(1)
          return n
        })
      }, 1200)
      return () => clearTimeout(t)
    }
  }, [count])

  // Auto-advance — off when paused, reduced-motion, hidden tab, or <2 slides.
  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      goTo(active + 1)
    }, ADVANCE_MS)
    return () => clearInterval(id)
  }, [count, paused, reducedMotion, active, goTo])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1) }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null
    setPaused(true)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current
    touchX.current = null
    setPaused(false)
    if (start == null) return
    const dx = (e.changedTouches[0]?.clientX ?? start) - start
    if (Math.abs(dx) > 40) goTo(dx < 0 ? active + 1 : active - 1)
  }

  const fade = useMemo(
    () => (reducedMotion ? 'none' : 'opacity 0.35s ease'),
    [reducedMotion],
  )

  if (count === 0) return null
  const slide = slides[active]

  const arrowStyle: React.CSSProperties = {
    width: 32,
    height: 32,
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 4,
    background: 'transparent',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    lineHeight: '30px',
    cursor: 'pointer',
    padding: 0,
    fontFamily: "'Roboto', sans-serif",
  }

  return (
    <div
      className="hero-slider"
      role="region"
      aria-roledescription="carousel"
      aria-label="Addendum examples"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{ outline: 'none' }}
    >
      {/* Fixed aspect-ratio frame — identical for every slide: zero CLS. */}
      <div className="hero-slider-frame">
        {slides.map((s, i) => (
          <div
            key={s.id}
            aria-hidden={i !== active}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: i === active ? 1 : 0,
              transition: fade,
              pointerEvents: i === active ? 'auto' : 'none',
              background: '#ffffff',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {mounted.has(i) && (
              <Image
                src={s.image_path}
                alt={`${s.title} — ${s.description}`}
                fill
                priority={i === 0}
                loading={i === 0 ? undefined : 'lazy'}
                sizes="(max-width: 860px) 250px, 260px"
                style={{ objectFit: 'contain', objectPosition: 'center top' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Title + description beside the image (below it on mobile). */}
      <div className="hero-slider-text">
        <div aria-live="polite">
          <h3 style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#ffffff',
            margin: '0 0 8px',
            lineHeight: 1.35,
          }}>
            {slide.title}
          </h3>
          <p style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.72)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            {slide.description}
          </p>
        </div>

        {count > 1 && (
          <div className="hero-slider-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
            <button type="button" aria-label="Previous slide" style={arrowStyle} onClick={() => goTo(active - 1)}>
              ‹
            </button>
            <div style={{ display: 'flex', gap: 8 }} role="tablist" aria-label="Slides">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Slide ${i + 1}: ${s.title}`}
                  onClick={() => goTo(i)}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    background: i === active ? '#ffa500' : 'rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
            <button type="button" aria-label="Next slide" style={arrowStyle} onClick={() => goTo(active + 1)}>
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
