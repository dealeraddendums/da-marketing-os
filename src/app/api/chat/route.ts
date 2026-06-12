import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are the DealerAddendums sales assistant. You help car dealers understand how DealerAddendums can solve their addendum and compliance paperwork challenges.

Key facts:
- DealerAddendums.com — subscription service for new and used vehicle dealers since 2014
- Prints vehicle addendums, FTC Buyers Guides (English + Spanish), CPO Info Sheets
- Automatic inventory from any website provider, syndication company, or DMS — no manual VIN entry
- Rules-based products: set once by make, model, trim, year, body style, mileage, fuel type — auto-applies to every matching vehicle; addendums build themselves, virtually eliminating manual-entry error
- Magic Button: one-click button on the dealer's VDP showing shoppers the exact PDF addendum from the lot — the online listing carries the same disclosures as the printed sticker
- Combo Addendum: clearly separates Required add-ons from Suggested (optional) ones
- DA Installer iOS app (VIN scan, print from the lot) — included with every plan
- Pricing: $100/mo (manual), $150/mo (auto-web), $200/mo (auto-DMS)
- Only paid add-on: Color-Matched Vehicle Images $50/mo (stock photo matched to each vehicle's actual color on the addendum)
- 30-day free trial (up to 30 vehicles), no credit card; labels as low as $0.22 each (volume pricing), 25 free labels included
- 1,600+ active dealers, 3.6M+ addendums printed
- Month-to-month, no contracts, no setup fees
- US-based support, 24/7
- Multi-rooftop group accounts available
- NEVER cite the FTC CARS rule (it was withdrawn). Never claim the product "makes dealers FTC-compliant" — it supports compliant, transparent disclosures.

Your goal: help dealers understand the product, answer questions honestly, and encourage them to start a free trial. If they're ready to sign up, ask for their name, dealership name, and email — then confirm you'll have someone follow up.

Keep responses concise (2-3 sentences max). Be friendly and knowledgeable. Never make up features or pricing not listed above.`

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — please try again in a moment.' }, { status: 429 })
  }

  try {
    const { messages, dealerType, utmTerm, sessionId } = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    // Capture lead if contact info is mentioned in conversation
    const lastUserMsg = messages[messages.length - 1]?.content || ''
    const emailMatch = lastUserMsg.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    if (emailMatch && sessionId) {
      supabase.from('marketing_leads').upsert({
        email: emailMatch[0],
        source: 'chat',
        utm_term: utmTerm || null,
        dealer_type: dealerType || null,
        session_id: sessionId,
      }, { onConflict: 'email' }).then(() => {}, () => {})
    }

    // Streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            system: SYSTEM_PROMPT,
            messages: messages.map((m: { role: string; content: string }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            stream: true,
          })

          for await (const event of response) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } catch (e) {
          controller.enqueue(encoder.encode('\n\nSorry, I ran into an issue. Please try again or call us at (801) 415-9435.'))
        } finally {
          controller.close()
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
  } catch (e) {
    console.error('chat error:', e)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
