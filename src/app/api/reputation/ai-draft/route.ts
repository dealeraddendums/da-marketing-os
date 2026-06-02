import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { starToNumber } from '@/lib/gbp'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// POST /api/reputation/ai-draft  { reviewId, reviewText?, starRating?, reviewerName? }
// Streams a Claude-drafted reply (text/plain) and persists it to gbp_reviews.ai_draft.
export async function POST(req: NextRequest) {
  const { reviewId, reviewText, starRating, reviewerName } = await req.json()
  if (!reviewId && !reviewText) {
    return NextResponse.json({ error: 'reviewId or reviewText required' }, { status: 400 })
  }

  // Resolve the review text (allow passing it directly, else look it up).
  let text: string = reviewText || ''
  let rating: number = starToNumber(starRating)
  let name: string = reviewerName || ''
  if (!text && reviewId) {
    const { data } = await supabase
      .from('gbp_reviews')
      .select('comment, star_rating, reviewer_name')
      .eq('review_id', reviewId)
      .maybeSingle()
    text = data?.comment || ''
    rating = starToNumber(data?.star_rating)
    name = data?.reviewer_name || ''
  }

  const prompt = `You are responding on behalf of DealerAddendums, a B2B SaaS platform serving franchise car dealerships. Write a professional, warm, and specific response to this Google review. Keep it under 150 words. Do not be generic. Reference specifics from the review where possible.

Reviewer: ${name || 'A customer'}
Star rating: ${rating || 'unknown'} out of 5
Review: "${text}"

Write only the reply text, with no preamble or quotation marks.`

  const encoder = new TextEncoder()
  let full = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        })
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch {
        controller.enqueue(encoder.encode('Sorry — the AI draft could not be generated. Please try again.'))
      } finally {
        controller.close()
        // Persist the draft (best-effort) once streaming completes.
        if (reviewId && full.trim()) {
          supabase.from('gbp_reviews')
            .update({ ai_draft: full.trim(), updated_at: new Date().toISOString() })
            .eq('review_id', reviewId)
            .then(() => {}, () => {})
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Accel-Buffering': 'no',
    },
  })
}
