import { NextRequest, NextResponse } from 'next/server'
import { generateText, parseJSON } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const { section, audience, goal } = await req.json()

  if (!section || !audience || !goal) {
    return NextResponse.json({ error: 'section, audience, and goal are required' }, { status: 400 })
  }

  const prompt = `You are a conversion copywriter for DealerAddendums.com — a SaaS platform used by 1,600+ car dealerships to print vehicle addendums, buyers guides, and info sheets. The platform has been running since 2014 and has printed over 2.3 million addendums.

Generate 3 distinct copy variants for the "${section}" section of the marketing site.
Target audience: ${audience}
Goal: ${goal}

For each variant provide:
- headline (max 10 words, punchy)
- subheadline (1 sentence, expands on headline)
- reasoning (1 sentence: why this would convert)

Respond ONLY with a JSON array, no markdown, no explanation:
[
  { "variant": "Control", "headline": "...", "subheadline": "...", "reasoning": "..." },
  { "variant": "Urgency", "headline": "...", "subheadline": "...", "reasoning": "..." },
  { "variant": "Social Proof", "headline": "...", "subheadline": "...", "reasoning": "..." }
]`

  try {
    const text = await generateText(prompt, 1000)
    const variants = parseJSON<Array<{ variant: string; headline: string; subheadline: string; reasoning: string }>>(text)

    if (!Array.isArray(variants)) {
      return NextResponse.json({ error: 'AI returned unexpected format' }, { status: 500 })
    }

    return NextResponse.json({ variants })
  } catch (e) {
    console.error('ai-copy error:', e)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
