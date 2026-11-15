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
  }, [bucket])
  return null
}
