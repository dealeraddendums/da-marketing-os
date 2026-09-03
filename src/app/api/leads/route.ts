import { NextRequest, NextResponse } from 'next/server'
import { sendMandrillEmail } from '@/lib/mandrill'
import { supabase } from '@/lib/supabase'
import { generateText, parseJSON } from '@/lib/ai'
import { rateLimit } from '@/lib/rate-limit'
import { trackServerEvent } from '@/lib/analytics'
import { verifyTurnstile } from '@/lib/turnstile'
import { newConfirmToken, sendConfirmationEmail } from '@/lib/lead-confirm'

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

type ProvisionResult = {
  status: 'provisioned' | 'existing' | 'failed' | 'skipped'
  dealer_id?: string | null
  group_id?: string | null
  existing?: boolean
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — please wait a moment.' }, { status: 429 })
  }

  const body = await req.json()
  const { name, email, dealership, phone } = body
  const zip = (body.zip as string)?.trim() || null
  const attribution = resolveAttribution(body, req)

  // Cloudflare Turnstile — verify BEFORE any insert or provisioning. Skipped
  // automatically when TURNSTILE_SECRET_KEY is unset (dev).
  const turnstile = await verifyTurnstile(
    (body.turnstileToken as string | undefined) ?? (body['cf-turnstile-response'] as string | undefined),
    ip,
  )
  if (!turnstile.ok) {
    return NextResponse.json(
      { error: 'Could not verify you are human — please complete the challenge and try again.' },
      { status: 403 },
    )
  }

  if (!name || !email || !dealership) {
    return NextResponse.json(
      { error: 'Name, email, and dealership are required.' },
      { status: 400 }
    )
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const accountKind: 'single' | 'group' = body.accountKind === 'group' ? 'group' : 'single'
  const groupName = (body.groupName as string | undefined)?.trim() || (accountKind === 'group' ? dealership : undefined)

  const [firstName, ...rest] = name.trim().split(' ')
  const lastName = rest.join(' ')
  void lastName

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
  // Dynamic Landing Engine join keys — let later phases connect
  // visitor → lead → trial → paid per context/variation.
  const contextKey  = (body.contextKey as string) || null
  const variationId = (body.variationId as string) || null

  const confirmToken = newConfirmToken()

  const leadPayload: Record<string, unknown> = {
    name,
    email,
    dealership,
    phone: phone || null,
    zip: zip || null,
    source: 'website',
    account_kind: accountKind,
    ...attribution,
    ai_enrichment: aiEnrichment,
    status: 'new',
    context_key: contextKey,
    variation_id: variationId,
    ab_variant: (body.abVariant as string) || null,
    headline_seen: (body.headlineSeen as string) || null,
    // Layer 0: nothing is provisioned until this token comes back.
    confirm_token: confirmToken,
    confirm_sent_at: new Date().toISOString(),
    provision_status: 'awaiting_confirmation',
    // The real browser IP — forwarded to the platform's rate-limit ledger at
    // confirmation time, since this box is the only hop that sees it.
    source_ip: ip === 'unknown' ? null : ip,
  }
  const _leadPayloadReady = true
  void _leadPayloadReady

  let { data: lead, error: dbError } = await supabase
    .from('marketing_leads')
    .insert(leadPayload)
    .select()
    .single()

  // marketing_leads.zip may not exist yet (pending the ALTER TABLE) — if the
  // insert fails on the unknown column, drop zip and retry so the signup still
  // saves rather than failing the whole submission.
  if (dbError && /zip/i.test(dbError.message)) {
    delete leadPayload.zip
    ;({ data: lead, error: dbError } = await supabase
      .from('marketing_leads')
      .insert(leadPayload)
      .select()
      .single())
  }

  if (dbError) {
    console.error('Supabase insert error:', dbError)
    return NextResponse.json({ error: 'Failed to save lead — please try again.' }, { status: 500 })
  }

  // Layer 0 — send the confirmation email. DA Platform is NOT called yet: the
  // account is provisioned only once the applicant clicks the link, which is
  // what a fake or unmonitored address can never do. See lib/lead-confirm.ts.
  try {
    await sendConfirmationEmail({ email, name, dealership, token: confirmToken })
  } catch (err) {
    console.error('[leads] confirmation email failed:', err instanceof Error ? err.message : err)
    // The lead is saved; support can re-send. Don't fail the submission.
  }
  const provision = { status: 'awaiting_confirmation' as const }

  // Server-side analytics with attribution (non-blocking)
  trackServerEvent('signup', {
    dealership,
    account_kind: accountKind,
    provision_status: provision.status,
    context_key: contextKey,
    variation_id: variationId,
    ...attribution,
  }, email)

  // Internal notification to the team. (The lead-facing welcome is now DA
  // Platform's passkey invite — marketing no longer sends its own welcome.)
  sendMandrillEmail({
    from_email: 'noreply@dealeraddendums.com',
    from_name: 'DealerAddendums',
    to: [{ email: process.env.LEAD_NOTIFY_EMAIL || 'allan@dealeraddendums.com' }],
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
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">${accountKind === 'group' ? 'Group' : 'Dealership'}</td><td style="padding:6px 0;">${dealership}</td></tr>
            ${phone ? `<tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Phone</td><td style="padding:6px 0;">${phone}</td></tr>` : ''}
            ${zip ? `<tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Zip</td><td style="padding:6px 0;">${zip}</td></tr>` : ''}
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Account</td><td style="padding:6px 0;">${accountKind} · provisioning: ${provision.status}</td></tr>
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

  // needsConfirm tells the form to say "check your email" instead of
  // "you're all set" — nothing exists yet at this point.
  return NextResponse.json({
    ok: true,
    id: lead?.id,
    kind: accountKind,
    needsConfirm: true,
    existing: false,
  })
}
