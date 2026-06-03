import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabase } from '@/lib/supabase'
import { createOrUpdateHubSpotContact } from '@/lib/hubspot'
import { generateText, parseJSON } from '@/lib/ai'
import { rateLimit } from '@/lib/rate-limit'
import { trackServerEvent } from '@/lib/analytics'

const ATTR_FIELDS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
  'utm_content', 'gclid', 'referrer', 'landing_page',
] as const

// Resolve attribution from the POST body, falling back to the da_attribution
// cookie (set first-touch in middleware) when the client didn't send it. Empty
// strings collapse to null so a direct visit stores null utm/gclid.
function resolveAttribution(
  body: Record<string, unknown>,
  req: NextRequest
): Record<string, string | null> {
  let cookieAttr: Record<string, unknown> = {}
  try {
    const raw = req.cookies.get('da_attribution')?.value
    if (raw) cookieAttr = JSON.parse(raw)
  } catch {
    // malformed cookie — ignore, fall back to body only
  }
  const out: Record<string, string | null> = {}
  for (const f of ATTR_FIELDS) {
    out[f] = (body[f] as string) || (cookieAttr[f] as string) || null
  }
  return out
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || 'placeholder')
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — please wait a moment.' }, { status: 429 })
  }

  const body = await req.json()
  const { name, email, dealership, phone } = body
  const attribution = resolveAttribution(body, req)

  if (!name || !email || !dealership) {
    return NextResponse.json(
      { error: 'Name, email, and dealership are required.' },
      { status: 400 }
    )
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const [firstName, ...rest] = name.trim().split(' ')
  const lastName = rest.join(' ')

  // AI enrichment (fire and don't wait initially)
  let aiEnrichment: Record<string, string> | null = null
  try {
    const enrichPrompt = `A car dealer just signed up for a free trial of DealerAddendums.com.

Name: ${name}
Email: ${email}
Dealership: ${dealership}
Phone: ${phone || 'not provided'}

Based on the dealership name and email domain, provide a brief intelligence summary in JSON:
{
  "estimatedSize": "single-point | small-group | large-group",
  "likelyType": "franchise | independent | used-car",
  "useCase": "one sentence on their most likely use case",
  "followUpAngle": "one sentence on the best sales angle",
  "priority": "high | medium | low"
}`
    const text = await generateText(enrichPrompt, 300)
    aiEnrichment = parseJSON<Record<string, string>>(text)
  } catch {
    // enrichment is non-blocking
  }

  // Save to Supabase
  const { data: lead, error: dbError } = await supabase
    .from('marketing_leads')
    .insert({
      name,
      email,
      dealership,
      phone: phone || null,
      source: 'website',
      ...attribution,
      ai_enrichment: aiEnrichment,
      status: 'new',
    })
    .select()
    .single()

  if (dbError) {
    console.error('Supabase insert error:', dbError)
    return NextResponse.json({ error: 'Failed to save lead — please try again.' }, { status: 500 })
  }

  // Server-side analytics with attribution (non-blocking)
  trackServerEvent('signup', { dealership, ...attribution }, email)

  // HubSpot sync (non-blocking)
  createOrUpdateHubSpotContact({
    email,
    firstName,
    lastName,
    company: dealership,
    phone,
  }).catch(() => {})

  // Notify allan@ via Resend
  getResend().emails.send({
    from: 'DealerAddendums <noreply@dealeraddendums.com>',
    to: process.env.LEAD_NOTIFY_EMAIL || 'allan@dealeraddendums.com',
    subject: `New trial signup: ${name} — ${dealership}`,
    html: `
      <div style="font-family: Roboto, sans-serif; font-size: 14px; color: #333; max-width: 600px;">
        <div style="background: #2a2b3c; padding: 16px 24px; border-radius: 6px 6px 0 0;">
          <span style="background:#ffa500;color:#2a2b3c;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.08em;">DA</span>
          <span style="color:#fff;font-size:14px;margin-left:10px;">New Trial Signup</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;width:120px;">Name</td><td style="padding:6px 0;">${name}</td></tr>
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Dealership</td><td style="padding:6px 0;">${dealership}</td></tr>
            ${phone ? `<tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Phone</td><td style="padding:6px 0;">${phone}</td></tr>` : ''}
          </table>
          ${aiEnrichment ? `
          <div style="margin-top:20px;padding:16px;background:#f5f6f7;border-radius:6px;border:1px solid #e0e0e0;">
            <div style="font-size:12px;font-weight:700;color:#78828c;text-transform:uppercase;margin-bottom:10px;">AI Enrichment</div>
            <div style="font-size:13px;color:#333;">Size: ${aiEnrichment.estimatedSize} &nbsp;·&nbsp; Type: ${aiEnrichment.likelyType} &nbsp;·&nbsp; Priority: ${aiEnrichment.priority}</div>
            <div style="font-size:13px;color:#55595c;margin-top:6px;">${aiEnrichment.useCase}</div>
            <div style="font-size:13px;color:#1976d2;margin-top:4px;font-style:italic;">${aiEnrichment.followUpAngle}</div>
          </div>` : ''}
        </div>
      </div>
    `,
  }).catch(() => {})

  // Confirmation email to lead
  getResend().emails.send({
    from: 'DealerAddendums <hello@dealeraddendums.com>',
    to: email,
    subject: `Welcome to DealerAddendums, ${firstName}!`,
    html: `
      <div style="font-family: Roboto, sans-serif; font-size: 14px; color: #333; max-width: 600px;">
        <div style="background: #2a2b3c; padding: 16px 24px; border-radius: 6px 6px 0 0;">
          <span style="background:#ffa500;color:#2a2b3c;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.08em;">DA</span>
          <span style="color:#fff;font-size:14px;margin-left:10px;">DealerAddendums</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:32px;border-radius:0 0 6px 6px;">
          <h1 style="font-size:22px;font-weight:600;color:#333;margin:0 0 16px;">Hi ${firstName}, welcome!</h1>
          <p style="line-height:1.7;margin:0 0 16px;">Thanks for signing up for your DealerAddendums free trial. We'll reach out within one business day to get your account set up for <strong>${dealership}</strong>.</p>
          <p style="line-height:1.7;margin:0 0 24px;">In the meantime, if you have any questions, just reply to this email.</p>
          <p style="font-size:13px;color:#55595c;margin:0;">— The DealerAddendums Team</p>
        </div>
      </div>
    `,
  }).catch(() => {})

  return NextResponse.json({ ok: true, id: lead?.id })
}
