import { NextRequest, NextResponse } from 'next/server'
import { generateText, parseJSON, MODEL } from '@/lib/ai'
import { supabase } from '@/lib/supabase'

const CACHE = new Map<string, any>()

export async function POST(req: NextRequest) {
  const { utmTerm, utmCampaign, utmSource, dealerType, abVariant } = await req.json()

  if (!utmTerm) {
    return NextResponse.json({ error: 'utm_term is required' }, { status: 400 })
  }

  const cacheKey = `${utmTerm}::${abVariant}::${dealerType}`

  if (CACHE.has(cacheKey)) {
    return NextResponse.json({ ...CACHE.get(cacheKey), cached: true })
  }

  const prompt = `You are a conversion copywriter for DealerAddendums.com — a SaaS platform used by 1,600+ car dealerships to print vehicle addendums, buyers guides, and info sheets. The platform has been running since 2014, is month-to-month with no contracts, and has printed over 2.3 million addendums.

A visitor just clicked an ad and arrived at the site. Here is their context:
- Search term: "${utmTerm}"
- Campaign: "${utmCampaign || 'unknown'}"
- Traffic source: "${utmSource || 'unknown'}"
- Dealer type detected: "${dealerType}"
- A/B variant strategy: "${abVariant}" (generic = ignore search term, personalized = match search term exactly, dealertype = focus on dealer segment)

Generate personalized above-the-fold copy for the "${abVariant}" variant strategy.

Rules:
- Headline: max 8 words, punchy, directly relevant to their search
- Subheadline: 1 sentence, expands the headline, mentions a key benefit
- CTA: 3-5 words, action-oriented
- Social proof: 1 short phrase (stat or trust signal)
- Keep it dealer-industry authentic — no generic SaaS language

Respond ONLY with JSON, no markdown:
{
  "headline": "...",
  "subheadline": "...",
  "cta": "...",
  "socialProof": "...",
  "reasoning": "one sentence explaining why this converts"
}`

  try {
    const text = await generateText(prompt, 400)
    const result = parseJSON<{
      headline: string
      subheadline: string
      cta: string
      socialProof: string
      reasoning: string
    }>(text)

    if (!result?.headline) {
      return NextResponse.json({ error: 'Generation returned invalid JSON' }, { status: 500 })
    }

    const response = {
      ...result,
      cached: false,
      generatedAt: new Date().toISOString(),
      utmTerm,
      abVariant,
      dealerType,
    }

    CACHE.set(cacheKey, response)
    setTimeout(() => CACHE.delete(cacheKey), 1000 * 60 * 60 * 24)

    supabase.from('personalization_log').upsert({
      utm_term: utmTerm,
      ab_variant: abVariant,
      dealer_type: dealerType,
      headline: result.headline,
      subheadline: result.subheadline,
      cached: false,
    }, {
      onConflict: 'utm_term,ab_variant,dealer_type',
      ignoreDuplicates: false,
    }).then(() => {}, () => {})

    return NextResponse.json(response)
  } catch (e) {
    console.error('Personalization generation failed:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
