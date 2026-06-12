import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Active Dealers — live count from DA Platform (the marketing Supabase holds
// no dealer records). Cached ~1h; falls back to a static "1,600+" so the
// dashboard never breaks on a platform hiccup.
const DEALER_COUNT_TTL_MS = 60 * 60 * 1000
let dealerCountCache: { value: string; fetchedAt: number } | null = null

async function getActiveDealerCount(): Promise<string> {
  if (dealerCountCache && Date.now() - dealerCountCache.fetchedAt < DEALER_COUNT_TTL_MS) {
    return dealerCountCache.value
  }
  const base = process.env.DA_PLATFORM_URL
  const key = process.env.SELF_SERVE_API_KEY
  if (base && key) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${base.replace(/\/$/, '')}/api/stats/active-dealers`, {
        headers: { 'X-API-Key': key },
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timer)
      if (res.ok) {
        const { count } = (await res.json()) as { count: number }
        if (typeof count === 'number' && count > 0) {
          dealerCountCache = { value: count.toLocaleString(), fetchedAt: Date.now() }
          return dealerCountCache.value
        }
      }
    } catch {
      // fall through to static fallback
    }
  }
  return '1,600+'
}

export async function GET(req: NextRequest) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const prevPeriodStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  let visitors = 0, prevVisitors = 0
  let trials = 0, prevTrials = 0
  let conversionRate = 0, prevConversionRate = 0

  try {
    // Current period: impressions from ab_events
    const { count: impressions } = await supabase
      .from('ab_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'hero_impression')
      .gte('created_at', thirtyDaysAgo)
    visitors = impressions || 0

    // Previous period impressions
    const { count: prevImpressions } = await supabase
      .from('ab_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'hero_impression')
      .gte('created_at', prevPeriodStart)
      .lt('created_at', thirtyDaysAgo)
    prevVisitors = prevImpressions || 0

    // Current period trials from marketing_leads
    const { count: leadsCount } = await supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)
    trials = leadsCount || 0

    // Previous period trials
    const { count: prevLeadsCount } = await supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', prevPeriodStart)
      .lt('created_at', thirtyDaysAgo)
    prevTrials = prevLeadsCount || 0

    conversionRate = visitors > 0 ? (trials / visitors) * 100 : 0
    prevConversionRate = prevVisitors > 0 ? (prevTrials / prevVisitors) * 100 : 0
  } catch {
    // Supabase not connected — return zeros, dashboard shows "N/A"
  }

  const delta = (current: number, previous: number, isPercent = false): string => {
    if (previous === 0) return current > 0 ? 'New' : '—'
    const diff = current - previous
    const pct = ((diff / previous) * 100).toFixed(1)
    const sign = diff >= 0 ? '+' : ''
    if (isPercent) return `${sign}${(diff).toFixed(2)}pp vs last 30d`
    return `${sign}${pct}% vs last 30d`
  }

  return NextResponse.json({
    visitors:       { value: visitors.toLocaleString(),       delta: delta(visitors, prevVisitors)               },
    trials:         { value: trials.toLocaleString(),         delta: delta(trials, prevTrials)                   },
    conversionRate: { value: `${conversionRate.toFixed(1)}%`, delta: delta(conversionRate, prevConversionRate, true) },
    activeDealers:  { value: await getActiveDealerCount(),    delta: '\u2014' },
  })
}
