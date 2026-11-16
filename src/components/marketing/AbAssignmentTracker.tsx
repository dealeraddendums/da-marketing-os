'use client'

// Pushes the Home B bucket into GTM's dataLayer once per page load so the GTM
// container can attach it to GA4 events. Deliberately NOT a gtag call — the
// container owns all tag routing (see app/layout.tsx). The bucket arrives as a
// server prop (decided in middleware), never read client-side, so the variant
// can't flicker and this component stays render-free.

import { useEffect, useRef } from 'react'

export default function AbAssignmentTracker({ bucket }: { bucket: 'A' | 'B' }) {
  const pushed = useRef(false)
  useEffect(() => {
    if (pushed.current) return
    pushed.current = true
    const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> }
    w.dataLayer = w.dataLayer || []
    // Whitelist before the push — only the two defined buckets may ever reach
    // GA4, whatever a future caller passes (bucket is typed, but the dataLayer
    // write is the last line of defense).
    w.dataLayer.push({ event: 'ab_assignment', ab_home: bucket === 'B' ? 'B' : 'A' })
    // First-party visitor beacon: reaching /api/ab/seen requires having run
    // this JS, which the UA-spoofing crawlers never do — that endpoint is what
    // increments the trusted "visitors" counter (deduped server-side to one
    // count per browser per 24h via cookie; team preview browsers excluded).
    // No body: the bucket is read from the server-set cookie, never sent.
    try {
      if (!navigator.sendBeacon?.('/api/ab/seen')) {
        void fetch('/api/ab/seen', { method: 'POST', keepalive: true, credentials: 'same-origin' })
      }
    } catch { /* counting must never break the page */ }
  }, [bucket])
  return null
}
