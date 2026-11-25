import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'
import { HERO_VARIANTS } from '@/lib/ab-variants'

export const dynamic = 'force-dynamic'

function calcSignificance(n1: number, c1: number, n2: number, c2: number): number {
  if (!n1 || !n2 || !c1 || !c2) return 0
  const p1 = c1 / n1
  const p2 = c2 / n2
  const pooled = (c1 + c2) / (n1 + n2)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
  if (!se) return 0
  const z = Math.abs(p1 - p2) / se
  // Approximate z to confidence: 1.96 ≈ 95%, 1.65 ≈ 90%, 1.28 ≈ 80%
  const conf = Math.min(99, Math.round(50 + 50 * Math.tanh(z * 1.2)))
  return conf
}

export async function GET() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { data: allRates, error } = await supabase
      .from('ab_conversion_rates')
      .select('*')

    // Only the experiment's defined arms are variants. Anything else in the
    // view (historic scanner junk, null buckets) is not part of the test and
    // must not render as a card or feed the significance math.
    const rates = (allRates || []).filter(
      (r: any) => (HERO_VARIANTS as readonly string[]).includes(r.ab_variant),
    )

    if (error || !rates.length) {
      return NextResponse.json({ live: false, experiments: [] })
    }

    const variantLabel: Record<string, string> = {
      generic: 'Generic (Control)',
      personalized: 'Personalized',
      dealertype: 'Dealer Type',
    }

    // Since mig 030 the view counts real signups from marketing_leads
    // (submits + emailed-confirm conversions), in two windows: all time and
    // since the Home B layout test ended (it halved hero-test traffic while
    // it overlapped, 2026-11-16 → 2026-11-25).
    const buildWindow = (suffix: '' | '_since') => {
      const variants = rates.map((r: any) => ({
        name: variantLabel[r.ab_variant] || r.ab_variant,
        ab_variant: r.ab_variant,
        visitors: r[`impressions${suffix}`] || 0,
        submits: r[`submits${suffix}`] || 0,
        conversions: r[`conversions${suffix}`] || 0,
        rate: parseFloat(r[`conversion_rate${suffix}`] || '0'),
      }))
      const sorted = [...variants].sort((a, b) => b.rate - a.rate)
      const winner = sorted[0]
      const control = variants.find(v => v.ab_variant === 'generic') || variants[0]
      const significance = winner && control && winner !== control
        ? calcSignificance(control.visitors, control.conversions, winner.visitors, winner.conversions)
        : 0
      return { variants, significance, winner: significance >= 90 ? winner?.name : null }
    }

    const fmtDay = (d: any) =>
      d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

    const firstSeen = rates.reduce((min: any, r: any) => {
      const d = r.first_seen || null
      return !min || (d && d < min) ? d : min
    }, null)
    const sinceBoundary = rates[0]?.since_boundary || null

    const windows = [
      { key: 'since', label: `Since Home B ended${sinceBoundary ? ` (${fmtDay(sinceBoundary)})` : ''}`, ...buildWindow('_since') },
      { key: 'all', label: `All time${firstSeen ? ` (since ${fmtDay(firstSeen)})` : ''}`, ...buildWindow('') },
    ]

    // Legacy top-level fields mirror the default (post-Home-B) window.
    const def = windows[0]
    const experiments = [{
      id: 'hero-variant',
      name: 'Hero Headline A/B Test',
      status: 'running',
      started: fmtDay(firstSeen) || 'Today',
      variants: def.variants,
      significance: def.significance,
      winner: def.winner,
      windows,
      defaultWindow: 'since',
    }]

    return NextResponse.json({ live: true, experiments })
  } catch (e) {
    console.error('ab-data error:', e)
    return NextResponse.json({ live: false, experiments: [] })
  }
}
