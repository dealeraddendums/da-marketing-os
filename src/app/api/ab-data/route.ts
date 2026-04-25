import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
  try {
    const { data: rates, error } = await supabase
      .from('ab_conversion_rates')
      .select('*')

    if (error || !rates?.length) {
      return NextResponse.json({ live: false, experiments: [] })
    }

    const variantLabel: Record<string, string> = {
      generic: 'Generic (Control)',
      personalized: 'Personalized',
      dealertype: 'Dealer Type',
    }

    const variants = rates.map((r: any) => ({
      name: variantLabel[r.ab_variant] || r.ab_variant,
      ab_variant: r.ab_variant,
      visitors: r.impressions || 0,
      conversions: r.conversions || 0,
      rate: parseFloat(r.conversion_rate || '0'),
    }))

    const sorted = [...variants].sort((a, b) => b.rate - a.rate)
    const winner = sorted[0]
    const control = variants.find(v => v.ab_variant === 'generic') || variants[0]

    const significance = winner && control && winner !== control
      ? calcSignificance(control.visitors, control.conversions, winner.visitors, winner.conversions)
      : 0

    const firstSeen = rates.reduce((min: any, r: any) => {
      const d = r.first_seen || null
      return !min || (d && d < min) ? d : min
    }, null)

    const started = firstSeen
      ? new Date(firstSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Today'

    const experiments = [{
      id: 'hero-variant',
      name: 'Hero Headline A/B Test',
      status: 'running',
      started,
      variants,
      significance,
      winner: significance >= 90 ? winner?.name : null,
    }]

    return NextResponse.json({ live: true, experiments })
  } catch (e) {
    console.error('ab-data error:', e)
    return NextResponse.json({ live: false, experiments: [] })
  }
}
