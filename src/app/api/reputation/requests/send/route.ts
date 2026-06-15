import { NextRequest, NextResponse } from 'next/server'
import { sendMandrillEmail } from '@/lib/mandrill'
import { supabase } from '@/lib/supabase'
import { getSegmentDealers, getReputationSettings, DealerContact, Segment } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

const FALLBACK_REVIEW_URL = 'https://www.google.com/search?q=DealerAddendums+reviews'

interface ManualRecipient {
  email: string
  dealer_name?: string
  contact_name?: string
}

// Parse pasted manual recipients: one per line, "email" or "email,dealer,contact".
function parseManual(raw: string): ManualRecipient[] {
  const out: ManualRecipient[] = []
  for (const line of (raw || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
    const parts = line.split(',').map(p => p.trim())
    const email = parts.find(p => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p))
    if (!email) continue
    const rest = parts.filter(p => p !== email)
    out.push({ email, dealer_name: rest[0], contact_name: rest[1] })
  }
  return out
}

function campaignEmailHtml(opts: {
  contactName: string
  dealerName: string
  positiveUrl: string
  negativeUrl: string
  openPixelUrl: string
}): string {
  const { contactName, dealerName, positiveUrl, negativeUrl, openPixelUrl } = opts
  return `
  <div style="font-family: Roboto, sans-serif; font-size: 14px; color: #333; max-width: 600px;">
    <div style="background: #2a2b3c; padding: 16px 24px; border-radius: 6px 6px 0 0;">
      <span style="background:#ffa500;color:#2a2b3c;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.08em;">DA</span>
      <span style="color:#fff;font-size:14px;margin-left:10px;">DealerAddendums</span>
    </div>
    <div style="border:1px solid #e0e0e0;border-top:none;padding:32px;border-radius:0 0 6px 6px;">
      <p style="line-height:1.7;margin:0 0 16px;">Hi ${contactName || 'there'},</p>
      <p style="line-height:1.7;margin:0 0 24px;">We'd love to hear how DealerAddendums has been working for <strong>${dealerName}</strong>.</p>
      <p style="margin:0 0 16px;">
        <a href="${positiveUrl}" style="display:inline-block;background:#1976d2;color:#fff;text-decoration:none;font-weight:500;padding:10px 18px;border-radius:4px;">😊 Share your experience on Google</a>
      </p>
      <p style="line-height:1.7;margin:24px 0 8px;color:#55595c;">If something hasn't been right, we want to know first.</p>
      <p style="margin:0 0 8px;">
        <a href="${negativeUrl}" style="display:inline-block;background:#fff;color:#333;text-decoration:none;font-weight:500;padding:10px 18px;border-radius:4px;border:1px solid #e0e0e0;">Share private feedback</a>
      </p>
      <p style="font-size:13px;color:#55595c;margin:28px 0 0;">Thank you,<br>The DealerAddendums Team</p>
    </div>
    <img src="${openPixelUrl}" width="1" height="1" style="display:none" alt="" />
  </div>`
}

// POST /api/reputation/requests/send  { name, segment, manualText? }
export async function POST(req: NextRequest) {
  const { name, segment, manualText } = await req.json()
  const seg = (segment || 'all_active') as Segment

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
  }

  // Resolve recipients.
  let recipients: DealerContact[] = []
  if (seg === 'manual') {
    recipients = parseManual(manualText || '').map(m => ({
      dealer_supabase_id: 'manual',
      dealer_name: m.dealer_name || 'Dealer',
      contact_name: m.contact_name || null,
      contact_email: m.email,
    }))
  } else {
    const { connected, dealers } = await getSegmentDealers(seg)
    if (!connected) {
      return NextResponse.json(
        { error: 'DA Platform Supabase is not configured. Add DA_PLATFORM_SUPABASE_URL and DA_PLATFORM_SUPABASE_SERVICE_KEY to send to dealer segments.' },
        { status: 400 }
      )
    }
    recipients = dealers
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found for this segment.' }, { status: 400 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'
  const { review_page_url } = await getReputationSettings()
  const reviewUrl = review_page_url || FALLBACK_REVIEW_URL

  // 1. Create the campaign.
  const { data: campaign, error: campErr } = await supabase
    .from('review_campaigns')
    .insert({ name: name.trim(), segment: seg, sent_at: new Date().toISOString() })
    .select()
    .single()
  if (campErr || !campaign) {
    return NextResponse.json({ error: campErr?.message || 'Could not create campaign' }, { status: 500 })
  }

  // 2. Create review_requests rows.
  const now = new Date().toISOString()
  const requestRows = recipients.map(r => ({
    dealer_supabase_id: r.dealer_supabase_id,
    dealer_name: r.dealer_name,
    contact_name: r.contact_name,
    contact_email: r.contact_email,
    status: 'pending',
    campaign_id: campaign.id,
  }))
  const { data: inserted, error: reqErr } = await supabase
    .from('review_requests')
    .insert(requestRows)
    .select('id, dealer_name, contact_name, contact_email')
  if (reqErr || !inserted) {
    return NextResponse.json({ error: reqErr?.message || 'Could not create requests' }, { status: 500 })
  }

  // 3. Send emails + mark sent.
  // Mandrill's sender no-ops (doesn't throw) when MANDRILL_API_KEY is unset —
  // guard so we don't mark requests "sent" when nothing actually went out.
  if (!process.env.MANDRILL_API_KEY) {
    console.warn('[reputation/send] MANDRILL_API_KEY not set — review requests left pending, nothing sent')
    return NextResponse.json({ ok: true, campaignId: campaign.id, sent: 0, recipients: recipients.length, note: 'MANDRILL_API_KEY not set' })
  }
  let sent = 0
  for (const reqRow of inserted) {
    const positiveUrl = `${siteUrl}/api/reputation/track/click/${reqRow.id}?to=positive`
    const negativeUrl = `${siteUrl}/api/reputation/track/click/${reqRow.id}?to=negative`
    const openPixelUrl = `${siteUrl}/api/reputation/track/open/${reqRow.id}`
    try {
      await sendMandrillEmail({
        from_email: 'hello@dealeraddendums.com',
        from_name: 'DealerAddendums',
        to: [{ email: reqRow.contact_email }],
        subject: "How's your experience with DealerAddendums?",
        html: campaignEmailHtml({
          contactName: reqRow.contact_name || '',
          dealerName: reqRow.dealer_name,
          positiveUrl,
          negativeUrl,
          openPixelUrl,
        }),
      })
      await supabase.from('review_requests')
        .update({ status: 'sent', sent_at: now, updated_at: now })
        .eq('id', reqRow.id)
      sent++
    } catch {
      // leave as pending; campaign total reflects only successful sends
    }
  }

  // 4. Update campaign total_sent.
  await supabase.from('review_campaigns').update({ total_sent: sent }).eq('id', campaign.id)

  return NextResponse.json({ ok: true, campaignId: campaign.id, sent, recipients: recipients.length })
}
