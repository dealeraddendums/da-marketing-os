import { NextRequest, NextResponse } from 'next/server'
import { generateText, parseJSON } from '@/lib/ai'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'

export async function POST(req: NextRequest) {
  // Two callers: the cron (x-api-key = DA_CRON_KEY) and the admin dashboard
  // (da_admin_auth cookie, no key). Accept either; reject anything else.
  const cronKey = req.headers.get('x-api-key')
  const authorized = cronKey
    ? cronKey === process.env.DA_CRON_KEY
    : isAdminAuthed()
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Pull real data from Supabase for context
  let analytics = {
    visitors: 0, trials: 0, impressions: 0, conversionRate: '0%',
    topVariant: 'unknown', topUtmTerm: 'unknown',
  }

  try {
    const { data: abData } = await supabase.from('ab_conversion_rates').select('*')
    const { data: topTerms } = await supabase.from('top_utm_terms').select('*').limit(3)
    const { data: leads } = await supabase.from('marketing_leads')
      .select('id', { count: 'exact' })
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (abData?.length) {
      const totalImpressions = abData.reduce((s, r) => s + (r.impressions || 0), 0)
      const totalConversions = abData.reduce((s, r) => s + (r.conversions || 0), 0)
      const best = [...abData].sort((a, b) => (b.conversion_rate || 0) - (a.conversion_rate || 0))[0]
      analytics = {
        visitors: totalImpressions,
        trials: totalConversions,
        impressions: totalImpressions,
        conversionRate: `${((totalConversions / Math.max(totalImpressions, 1)) * 100).toFixed(1)}%`,
        topVariant: best?.ab_variant || 'personalized',
        topUtmTerm: topTerms?.[0]?.utm_term || 'unknown',
      }
    }
    analytics.trials = leads?.length || analytics.trials
  } catch {
    // Use defaults if Supabase isn't set up yet
  }

  const prompt = `You are a CRO analyst for DealerAddendums.com, a B2B SaaS platform for car dealers with 1,600+ active customers.

Analytics snapshot (last 7 days):
${JSON.stringify(analytics, null, 2)}

Generate exactly 4 actionable insights. Each 1–2 sentences, specific, with a concrete next action tied to the data.
Use emoji prefixes: 📈 growth opportunity, 📉 problem to fix, 🎯 targeting insight, ✍️ content opportunity.

Respond ONLY as a JSON array of strings (no markdown, no wrapper):
["insight 1", "insight 2", "insight 3", "insight 4"]`

  try {
    const text = await generateText(prompt, 600)
    const insights = parseJSON<string[]>(text)

    if (!Array.isArray(insights)) {
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 500 })
    }

    return NextResponse.json({ insights: insights.slice(0, 4), generatedAt: new Date().toISOString() })
  } catch (e) {
    console.error('insights error:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
