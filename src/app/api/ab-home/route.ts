import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'
import { abHomeBPct } from '@/lib/ab-home'

export const dynamic = 'force-dynamic'

// Home B layout test — first-party numbers for the admin A/B tab card.
// Deliberately NOT GA4: visitors + form starts come from ab_home_stats (the
// middleware/form-start counters) and signups from marketing_leads.ab_home.

interface BucketStats {
  visitors: number
  formStarts: number
  submits: number
  signups: number // confirmed (provisioned) trials — the success metric
}

export async function GET() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const empty = (): BucketStats => ({ visitors: 0, formStarts: 0, submits: 0, signups: 0 })
  const buckets: Record<'A' | 'B', BucketStats> = { A: empty(), B: empty() }
  let live = false

  try {
    const { data: stats, error: statsErr } = await supabase
      .from('ab_home_stats')
      .select('bucket, metric, count')
    if (!statsErr && stats) {
      live = true
      for (const row of stats as Array<{ bucket: 'A' | 'B'; metric: string; count: number }>) {
        const b = buckets[row.bucket]
        if (!b) continue
        if (row.metric === 'visitors') b.visitors = row.count
        if (row.metric === 'form_start') b.formStarts = row.count
      }
    }

    // Lead counts per bucket. Volume is small (hundreds of rows carry ab_home
    // at most), so paging is unnecessary; head-count queries keep it exact.
    for (const bucket of ['A', 'B'] as const) {
      const { count: submits } = await supabase
        .from('marketing_leads')
        .select('id', { count: 'exact', head: true })
        .eq('ab_home', bucket)
      const { count: signups } = await supabase
        .from('marketing_leads')
        .select('id', { count: 'exact', head: true })
        .eq('ab_home', bucket)
        .not('confirmed_at', 'is', null)
      buckets[bucket].submits = submits || 0
      buckets[bucket].signups = signups || 0
      if (submits) live = true
    }
  } catch (e) {
    console.error('ab-home stats error:', e)
  }

  return NextResponse.json({ live, pct: abHomeBPct(), buckets })
}
