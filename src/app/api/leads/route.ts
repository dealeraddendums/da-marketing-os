import { NextRequest, NextResponse } from 'next/server'
import { sendMandrillEmail } from '@/lib/mandrill'
import { supabase } from '@/lib/supabase'
import { generateText, parseJSON } from '@/lib/ai'
import { rateLimit } from '@/lib/rate-limit'
import { trackServerEvent } from '@/lib/analytics'
import { verifyTurnstile } from '@/lib/turnstile'
import { provisionInDaPlatform, type ProvisionOutcome } from '@/lib/lead-confirm'
import { normalizeWebsiteUrl } from '@/lib/website-url'

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
  // Enrichment-confirmed address fields (optional — the form fills them from
  // the name+ZIP business lookup; the visitor can edit or clear them).
  const address = typeof body.address === 'string' ? body.address.trim().slice(0, 160) || null : null
  const city = typeof body.city === 'string' ? body.city.trim().slice(0, 80) || null : null
  const state = typeof body.state === 'string' ? body.state.trim().slice(0, 40) || null : null
  // Phase 6c: the chosen brand (single-dealer signups). The platform validates it
  // against its selectable-brands list at confirmation time; stored as given here.
  const brand = typeof body.brand === 'string' ? body.brand.trim().slice(0, 40) || null : null
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

  // Required: trial auto-onboarding reads a sample vehicle from the dealer's
  // site. Format check + normalize only (https:// added when missing) — the
  // site is never fetched here.
  const website = normalizeWebsiteUrl(body.website)
  if (!website.ok) {
    return NextResponse.json({ error: website.error }, { status: 400 })
  }

  // 'partner' (Partner / Reseller tab) provisions a restyler group + the
  // partner's own first rooftop on the platform side.
  const accountKind: 'single' | 'group' | 'partner' =
    body.accountKind === 'group' ? 'group' : body.accountKind === 'partner' ? 'partner' : 'single'
  const groupName = (body.groupName as string | undefined)?.trim() || (accountKind !== 'single' ? dealership : undefined)

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

  const leadPayload: Record<string, unknown> = {
    name,
    email,
    dealership,
    phone: phone || null,
    zip: zip || null,
    address,
    city,
    state,
    brand,
    website_url: website.url,
    source: 'website',
    account_kind: accountKind,
    ...attribution,
    ai_enrichment: aiEnrichment,
    status: 'new',
    context_key: contextKey,
    variation_id: variationId,
    ab_variant: (body.abVariant as string) || null,
    headline_seen: (body.headlineSeen as string) || null,
    // One-email flow (2026-11-01): no confirmation link anymore. The platform
    // gate runs below, at THIS submit, and sends the single setup-code email;
    // nothing is provisioned until the applicant enters that code. 'submitted'
    // is replaced by the gate outcome a moment later.
    provision_status: 'submitted',
    // The real browser IP — forwarded to the platform's rate-limit ledger,
    // since this box is the only hop that sees it.
    source_ip: ip === 'unknown' ? null : ip,
    // GA4 identity from the session that actually produced this lead. The
    // trial_signup conversion is sent when the setup code is verified — a
    // different session, arriving from an email client — so without these the
    // conversion would land attributed to Direct and cost-per-trial-by-channel
    // would be meaningless. Non-identifying: random first-party cookie values.
    ga_client_id: (body.ga_client_id as string) || null,
    ga_session_id: (body.ga_session_id as string) || null,
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
  if (dbError && /brand/i.test(dbError.message)) {
    delete leadPayload.brand
    ;({ data: lead, error: dbError } = await supabase
      .from('marketing_leads')
      .insert(leadPayload)
      .select()
      .single())
  }
  if (dbError && /zip/i.test(dbError.message)) {
    delete leadPayload.zip
    ;({ data: lead, error: dbError } = await supabase
      .from('marketing_leads')
      .insert(leadPayload)
      .select()
      .single())
  }
  // marketing_leads address/city/state are migration 022 — until it's applied,
  // save the lead without them rather than lose the signup.
  if (dbError && /\b(address|city|state)\b/i.test(dbError.message)) {
    console.warn('[leads] address/city/state rejected — migration 022 not applied yet; saving without them')
    delete leadPayload.address
    delete leadPayload.city
    delete leadPayload.state
    ;({ data: lead, error: dbError } = await supabase
      .from('marketing_leads')
      .insert(leadPayload)
      .select()
      .single())
  }

  // Same guard for the GA4 identity columns (migration 013). Analytics
  // attribution is worth a lot less than a signup, so if the migration has not
  // been applied yet the columns are dropped and the lead still saves — losing
  // attribution on that lead rather than losing the customer.
  if (dbError && /ga_client_id|ga_session_id/i.test(dbError.message)) {
    console.warn('[leads] ga_client_id/ga_session_id rejected — migration 013 not applied yet; saving without GA4 attribution')
    delete leadPayload.ga_client_id
    delete leadPayload.ga_session_id
    ;({ data: lead, error: dbError } = await supabase
      .from('marketing_leads')
      .insert(leadPayload)
      .select()
      .single())
  }

  // marketing_leads.website_url is migration 020 — until it's applied, save the
  // lead without it rather than lose the signup.
  if (dbError && /website_url/i.test(dbError.message)) {
    console.warn('[leads] website_url rejected — migration 020 not applied yet; saving without it')
    delete leadPayload.website_url
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

  // One-email flow — the platform gate (per-IP rate limit, domain/MX checks,
  // business hours, AI legitimacy) runs NOW, before any email goes out. Pass →
  // the platform sends the ONE setup-code email. Nothing is provisioned until
  // the applicant types that code into the platform (a human POST), which is
  // what a fake or unmonitored address can never do — the same property the
  // old Layer-0 confirm link enforced, with one email instead of two.
  const provision: ProvisionOutcome = await provisionInDaPlatform({
    name, email, dealership,
    phone: phone || null, zip,
    address, city, state,
    accountKind,
    groupName: accountKind !== 'single' ? groupName : undefined,
    attribution,
    sourceIp: ip === 'unknown' ? null : ip,
    websiteUrl: website.url,
    brand,
    leadId: (lead?.id as string | undefined) ?? null,
  })

  // Stamp the gate outcome on the lead. 'failed'/'skipped' (platform down or
  // unconfigured) becomes intake_failed — the applicant is told to retry, and
  // the internal notification below carries the status so staff see it.
  const leadStatus =
    provision.status === 'failed' || provision.status === 'skipped' ? 'intake_failed' : provision.status
  if (lead?.id) {
    const { error: stampErr } = await supabase
      .from('marketing_leads')
      .update({ provision_status: leadStatus })
      .eq('id', lead.id)
    if (stampErr) console.error('[leads] status stamp failed:', stampErr.message)
  }

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
    // "Form Submitted" is the stable phrase Allan's mail rules filter on —
    // the sibling notifications are "New Trial — Account Created" (da-platform
    // provisioning, once the dealer confirms) and "New Trial — Needs Review"
    // (the AI gate). Do not reword the leading phrase.
    subject: `New Trial — Form Submitted (${leadStatus === 'code_sent' ? 'code sent, awaiting entry' : leadStatus.replace(/_/g, ' ')}): ${dealership}`,
    html: `
      <div style="font-family: Roboto, sans-serif; font-size: 14px; color: #333; max-width: 600px;">
        <div style="background: #2a2b3c; padding: 16px 24px; border-radius: 6px 6px 0 0;">
          <span style="background:#ffa500;color:#2a2b3c;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.08em;">DA</span>
          <span style="color:#fff;font-size:14px;margin-left:10px;">New Trial — Form Submitted</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
          <p style="margin:0 0 16px;font-size:14px;color:#333;"><strong>A trial form was submitted — gate outcome: ${leadStatus.replace(/_/g, ' ')}.</strong> The account is not provisioned yet — that happens when the dealer enters the 8-digit setup code we emailed them.</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;width:120px;">Name</td><td style="padding:6px 0;">${name}</td></tr>
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">${accountKind === 'group' ? 'Group' : accountKind === 'partner' ? 'Partner company' : 'Dealership'}</td><td style="padding:6px 0;">${dealership}</td></tr>
            ${phone ? `<tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Phone</td><td style="padding:6px 0;">${phone}</td></tr>` : ''}
            ${address || city || state ? `<tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Address</td><td style="padding:6px 0;">${[address, city, state].filter(Boolean).join(', ')}</td></tr>` : ''}
            ${zip ? `<tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Zip</td><td style="padding:6px 0;">${zip}</td></tr>` : ''}
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Website</td><td style="padding:6px 0;">${website.url}</td></tr>
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

  // Browser-facing outcome. code_sent and pending_review answer IDENTICALLY
  // ("check your email for your code") so the form never reveals the AI
  // verdict; gate blocks surface as errors the applicant can act on.
  switch (provision.status) {
    case 'code_sent':
    case 'pending_review':
      return NextResponse.json({ ok: true, id: lead?.id, kind: accountKind, needsConfirm: true, existing: false })
    case 'existing':
      return NextResponse.json({ ok: true, id: lead?.id, kind: accountKind, needsConfirm: false, existing: true })
    case 'after_hours':
      return NextResponse.json(
        { error: provision.message || 'Sign-ups are open 5 AM–9 PM Pacific — please try again during business hours.' },
        { status: 403 },
      )
    case 'rejected':
      return NextResponse.json(
        { error: provision.message || 'We could not complete this signup — please check your details, or email support@dealeraddendums.com.' },
        { status: 400 },
      )
    default:
      // failed / skipped — the lead is saved (intake_failed); a retry re-runs
      // the gate cleanly.
      return NextResponse.json(
        { error: "We couldn't finish your signup just now — please try again in a few minutes, or email support@dealeraddendums.com." },
        { status: 503 },
      )
  }
}
