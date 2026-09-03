// Layer 0 — email confirmation before provisioning.
//
// /api/leads saves the lead and sends a confirmation email; nothing is
// provisioned until the applicant clicks through. That single step is what
// deterministically kills the bot-signup class: an address nobody monitors
// (bob11@wshu.net, alice0105@virgilian.com on 2026-09-03) can never confirm,
// and a real dealer pays one extra click.
//
// The confirmation LINK opens a page whose button POSTs. A GET that provisions
// would let an email link scanner create a dealership by prefetching — the same
// failure mode that made DA Platform's migration invites code-based.

import { randomBytes } from 'node:crypto'
import { sendMandrillEmail } from '@/lib/mandrill'
import { supabase } from '@/lib/supabase'

export interface ProvisionOutcome {
  status: 'provisioned' | 'existing' | 'pending_review' | 'after_hours' | 'rejected' | 'failed' | 'skipped'
  dealer_id?: string | null
  group_id?: string | null
  message?: string
}

export function newConfirmToken(): string {
  return randomBytes(32).toString('hex')
}

export function confirmUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com').replace(/\/$/, '')
  return `${base}/confirm/${token}`
}

export async function sendConfirmationEmail(args: {
  email: string; name: string; dealership: string; token: string
}): Promise<void> {
  const url = confirmUrl(args.token)
  const first = args.name.trim().split(' ')[0] || 'there'
  await sendMandrillEmail({
    from_email: 'noreply@dealeraddendums.com',
    from_name: 'DealerAddendums',
    to: [{ email: args.email, name: args.name }],
    subject: 'Confirm your email to start your DealerAddendums trial',
    html: `
      <div style="font-family: Roboto, Arial, sans-serif; font-size:14px; color:#333; max-width:600px;">
        <div style="background:#2a2b3c;padding:16px 24px;border-radius:6px 6px 0 0;">
          <span style="background:#ffa500;color:#2a2b3c;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.08em;">DA</span>
          <span style="color:#fff;font-size:14px;margin-left:10px;">Confirm your email</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
          <p>Hi ${first},</p>
          <p>Thanks for starting a free trial for <strong>${args.dealership}</strong>. Confirm your email address and we'll set up your account.</p>
          <p style="margin:24px 0;">
            <a href="${url}" style="background:#1976d2;color:#fff;padding:12px 22px;border-radius:4px;text-decoration:none;font-weight:600;">Confirm my email</a>
          </p>
          <p style="font-size:12px;color:#888;">If the button doesn't work, paste this into your browser:<br>${url}</p>
          <p style="font-size:12px;color:#888;">Didn't sign up? You can ignore this email — nothing was created.</p>
        </div>
      </div>`,
  })
}

/**
 * Server-to-server call into DA Platform to provision the Trial dealer/group.
 * DA Platform owns HubSpot + the onboarding invite, AND the signup gate — so
 * this maps its gate responses onto an outcome the UI can explain:
 *
 *   201 → provisioned          202 → pending_review (held for a human)
 *   403 + afterHours → after_hours   429/400 → rejected
 */
export async function provisionInDaPlatform(payload: {
  name: string
  email: string
  dealership: string
  phone: string | null
  zip: string | null
  accountKind: 'single' | 'group'
  groupName?: string
  attribution: Record<string, string | null>
  sourceIp?: string | null
}): Promise<ProvisionOutcome> {
  const base = process.env.DA_PLATFORM_URL
  const key = process.env.SELF_SERVE_API_KEY
  if (!base || !key) return { status: 'skipped' }

  const controller = new AbortController()
  // The platform's AI gate has its own 8s ceiling; allow headroom over it.
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/self-serve/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
        // The applicant's real browser IP — this box sits directly on EC2, so
        // it is the only place that sees it. The platform's rate-limit ledger
        // keys on this, not on our server address.
        ...(payload.sourceIp ? { 'X-Signup-Client-IP': payload.sourceIp } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => ({}))) as {
      existing?: boolean; pending?: boolean; afterHours?: boolean
      dealer_id?: string; group_id?: string; message?: string; error?: string
    }
    if (res.status === 202 || data.pending) {
      return { status: 'pending_review', message: data.message }
    }
    if (res.status === 403 && data.afterHours) {
      return { status: 'after_hours', message: data.error }
    }
    if (res.status === 429 || res.status === 400) {
      console.warn('[leads] provisioning rejected by gate:', res.status, data.error)
      return { status: 'rejected', message: data.error }
    }
    if (!res.ok) {
      console.error('[leads] provisioning HTTP', res.status)
      return { status: 'failed' }
    }
    if (data.existing) return { status: 'existing' }
    return { status: 'provisioned', dealer_id: data.dealer_id ?? null, group_id: data.group_id ?? null }
  } catch (err) {
    console.error('[leads] provisioning call failed:', err instanceof Error ? err.message : err)
    return { status: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

export interface LeadRow {
  id: string
  name: string
  email: string
  dealership: string
  phone: string | null
  zip: string | null
  account_kind: string | null
  source_ip: string | null
  confirmed_at: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  referrer: string | null
  landing_page: string | null
}

/** Consume the token, mark the lead confirmed, then provision. Single-use:
 *  the UPDATE clears confirm_token with a token predicate, so a re-click (or a
 *  scanner racing the user) can't provision twice. */
export async function confirmAndProvision(token: string): Promise<
  { ok: false; reason: 'invalid' | 'error' } | { ok: true; outcome: ProvisionOutcome; lead: LeadRow }
> {
  const { data: lead } = await supabase
    .from('marketing_leads')
    .select('*')
    .eq('confirm_token', token)
    .maybeSingle<LeadRow>()
  if (!lead) return { ok: false, reason: 'invalid' }

  const { data: claimed, error: claimErr } = await supabase
    .from('marketing_leads')
    .update({ confirmed_at: new Date().toISOString(), confirm_token: null })
    .eq('confirm_token', token)
    .select('id')
    .maybeSingle<{ id: string }>()
  if (claimErr || !claimed) return { ok: false, reason: 'invalid' }

  const attribution: Record<string, string | null> = {
    utm_source: lead.utm_source, utm_medium: lead.utm_medium, utm_campaign: lead.utm_campaign,
    utm_term: lead.utm_term, utm_content: lead.utm_content, gclid: lead.gclid,
    referrer: lead.referrer, landing_page: lead.landing_page,
  }
  const accountKind: 'single' | 'group' = lead.account_kind === 'group' ? 'group' : 'single'

  const outcome = await provisionInDaPlatform({
    name: lead.name, email: lead.email, dealership: lead.dealership,
    phone: lead.phone, zip: lead.zip, accountKind,
    groupName: accountKind === 'group' ? lead.dealership : undefined,
    attribution, sourceIp: lead.source_ip,
  })

  await supabase
    .from('marketing_leads')
    .update({
      da_dealer_id: outcome.dealer_id ?? null,
      da_group_id: outcome.group_id ?? null,
      provision_status: outcome.status,
    })
    .eq('id', lead.id)

  return { ok: true, outcome, lead }
}
