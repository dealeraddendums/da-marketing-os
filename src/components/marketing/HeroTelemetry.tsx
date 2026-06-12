'use client'
import { useEffect, useRef } from 'react'
import type { HeroTracking } from '@/lib/hero-engine'
import { capture, type WarmPayload } from './HeroSection'

// Invisible beacon for pages whose hero is server-rendered JSX (lp/[slug]):
// fires hero_view, triggers the background cache warm, and tracks cta_click
// on any element marked data-track="hero-cta".
export default function HeroTelemetry({ tracking, warm }: { tracking: HeroTracking; warm: WarmPayload | null }) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    capture('hero_view', tracking, { headline: tracking.headline })

    if (warm) {
      fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(warm),
        keepalive: true,
      }).catch(() => {})
    }

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.('[data-track="hero-cta"]')
      if (el) capture('cta_click', tracking, { cta_text: el.textContent?.trim() })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
