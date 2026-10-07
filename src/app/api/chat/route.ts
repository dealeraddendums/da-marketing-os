import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sendMandrillEmail } from '@/lib/mandrill'
import { supabase } from '@/lib/supabase'
import { MODEL } from '@/lib/ai'
import { extractContact } from '@/lib/chat-contact'
import { rateLimit } from '@/lib/rate-limit'
import { upsertChatContact } from '@/lib/hubspot'
import { escalateLead, wantsHuman } from '@/lib/escalate'
import { getConversationBySession, insertMessage } from '@/lib/chat-store'
import { relayVisitorMessage } from '@/lib/chat-handoff'

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
- 30-day free trial (up to 30 vehicles), no credit card. A free trial can request a one-time shipment of 25 addendum labels; labels otherwise are as low as $0.22 each (volume pricing)
- 1,600+ active dealers, 3.6M+ addendums printed
- Month-to-month, no contracts, no setup fees
- US-based support, 24/7
- Multi-rooftop group accounts available
- NEVER cite the FTC CARS rule (it was withdrawn). Never claim the product "makes dealers FTC-compliant" — it supports compliant, transparent disclosures.

Your role: answer questions honestly and helpfully so dealers understand the product. You do NOT sign anyone up and you do NOT create accounts. If someone is ready to start, point them to the "Start Free Trial" signup form on this page — they begin the trial there themselves.

Lead follow-up: you MAY make ONE soft, low-pressure offer to take an email so the team can follow up (e.g. "Happy to have someone follow up with more detail — what's the best email?"). NEVER require an email, NEVER make answering conditional on it, and don't ask more than once — if they decline or ignore it, keep helping fully. If someone just wants information, let them know someone can follow up if they'd like.

Talk to a human: if the visitor asks to speak to a real person / sales rep / wants a call, FIRST ask for the best email or phone so the team can reach them (optional — never required), THEN tell them: "I've notified our team — someone will reach out shortly. For immediate help, call (801) 415-9435." Never claim to be human, and never promise an exact callback time. (Our system also alerts the team automatically when someone asks for a person.)

Keep responses concise (2-3 sentences max). Be friendly and knowledgeable. Never make up features or pricing not listed above.`

interface ChatMsg { role: string; content: string }

// Sales-lead capture — NEVER creates a dealer/trial, NEVER calls provisioning.
// Insert-if-absent: if a lead with this email already exists (from the signup
// form, a prior chat, or a converted lead), do nothing — never touch its
// source/attribution/status. Only INSERT when the email is new. Runs
// fire-and-forget; never blocks or delays the chat stream.
function captureChatLead(opts: {
  email: string
  messages: ChatMsg[]
  utmTerm?: string | null
  attribution?: Record<string, unknown> | null
}): void {
  void (async () => {
    try {
      const email = opts.email.toLowerCase()
      const { data: existing } = await supabase
        .from('marketing_leads')
        .select('id')
        .eq('email', email)
        .limit(1)
      if (existing && existing.length > 0) return // never overwrite an existing lead

      // One non-streaming extraction pass over the transcript for the other fields.
      const { name, dealership, phone } = await extractContact(opts.messages)

      const { error } = await supabase.from('marketing_leads').insert({
        name,
        dealership,
        email,
        phone,
        source: 'chat',
        status: 'new',
        utm_term: opts.utmTerm || null,
        ...(opts.attribution || {}),
        // NOTE: marketing_leads has no session_id column (it lives on ab_events),
        // so the chat session id isn't persisted here — REAL columns only.
        // da_dealer_id / da_group_id intentionally null — chat never provisions,
        // so chat leads are excluded from the funnel join + reconcile cron.
      })
      if (error) {
        console.error('[chat] lead insert failed:', error.message)
        return
      }

      // New chat lead → HubSpot Contact so sales can work it in the CRM
      // (CONTACT only, never a Company/dealer — chat never provisions). Dedupe
      // by email + no-backward lifecyclestage guard live in upsertChatContact.
      // Fire-and-forget; the internal email above is the fallback if this fails.
      const attr = opts.attribution || {}
      void upsertChatContact({
        email,
        name,
        company: dealership,
        phone,
        utmSource: (attr.utm_source as string) || null,
        utmCampaign: (attr.utm_campaign as string) || null,
        utmTerm: opts.utmTerm || (attr.utm_term as string) || null,
        referrer: (attr.referrer as string) || null,
      }).then(r => { if (!r.ok) console.error('[chat] HubSpot contact upsert failed for', email) }, () => {})

      // Internal new-lead notification so sales follows up (best-effort).
      sendMandrillEmail({
        from_email: 'noreply@dealeraddendums.com',
        from_name: 'DealerAddendums',
        to: [{ email: process.env.LEAD_NOTIFY_EMAIL || 'allan@dealeraddendums.com' }],
        subject: `New chat lead: ${name || '(no name)'} — ${dealership || '(no dealership)'}`,
        html: `<div style="font-family:Roboto,sans-serif;font-size:14px;color:#333">
          <p><strong>New lead from the website chat</strong></p>
          <p>Name: ${name || '—'}<br>Dealership: ${dealership || '—'}<br>Email: ${email}<br>Phone: ${phone || '—'}</p>
          <p style="color:#78828c;font-size:12px">Source: chat · not yet a trial — follow up.</p>
        </div>`,
      }).catch(() => {})
    } catch (e) {
      console.error('[chat] lead capture error:', e instanceof Error ? e.message : e)
    }
  })()
}

/** An empty reply that tells the widget the conversation is with a person now. */
function liveSwitch(conversationId: string, at: string): Response {
  return new Response('', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Chat-Live': '1',
      'X-Chat-Conversation': conversationId,
      'X-Chat-At': at,
    },
  })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — please try again in a moment.' }, { status: 429 })
  }

  try {
    const { messages, utmTerm, sessionId, attribution } = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    // Fire-and-forget sales-lead capture when the latest user turn includes an
    // email. Does not block or delay the stream below.
    const lastUserMsg = messages[messages.length - 1]?.content || ''
    const emailMatch = lastUserMsg.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    if (emailMatch) {
      captureChatLead({ email: emailMatch[0], messages, utmTerm, attribution })
    }

    // ── Once a person has taken over, Steven stays quiet ─────────────────────
    // A widget that missed the switch (older tab, typed hand-off) still posts
    // here. Its message is relayed to the agent instead of being answered by
    // the bot, and the X-Chat-* headers tell the widget to switch to live mode.
    if (sessionId) {
      const convo = await getConversationBySession(sessionId).catch(() => null)
      if (convo?.status === 'live') {
        const text = String(lastUserMsg).slice(0, 2000)
        const saved = await insertMessage(convo.id, 'visitor', text)
        await relayVisitorMessage(convo, { id: saved?.id || `${convo.id}:${Date.now()}`, text })
        return liveSwitch(convo.id, new Date(new Date(convo.live_at || convo.created_at).getTime() - 1000).toISOString())
      }
    }

    // "Talk to a real person" — server-side intent detection. Awaited, so a
    // TYPED request connects the widget exactly like the button does: on a live
    // hand-off the bot does not answer, and the widget switches to live mode
    // and starts polling for the agent's reply. If no live path is available
    // (notify-only fallback) Steven answers as before.
    if (wantsHuman(lastUserMsg)) {
      const esc = await escalateLead({
        sessionId,
        messages,
        email: emailMatch?.[0] || null,
        page: req.headers.get('referer') || null,
        utm: {
          utm_source: (attribution?.utm_source as string) || null,
          utm_campaign: (attribution?.utm_campaign as string) || null,
          utm_term: utmTerm || null,
        },
        trigger: 'intent',
      })
      if (esc.live && esc.conversationId) return liveSwitch(esc.conversationId, esc.at || new Date().toISOString())
    }

    // Streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await client.messages.create({
            model: MODEL,
            max_tokens: 400,
            system: SYSTEM_PROMPT,
            messages: messages.map((m: ChatMsg) => ({
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
          // Log before falling back. Without this the widget failed silently
          // for months: the visitor saw an apology, the operator saw nothing.
          console.error('[chat] streaming completion failed:', e)
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
