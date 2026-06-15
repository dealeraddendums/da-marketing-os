import { NextRequest, NextResponse } from 'next/server'
import { sendMandrillEmail } from '@/lib/mandrill'
import { supabase } from '@/lib/supabase'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const ALERT_RECIPIENTS = ['allan@dealeraddendums.com', 'alex@dealeraddendums.com']

// POST /api/reputation/feedback  { requestId, feedback }
// PUBLIC (no auth) — private negative feedback from the review-request flow.
// Inserts to private_feedback and alerts the internal team via Mandrill.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — please wait a moment.' }, { status: 429 })
  }

  const { requestId, feedback } = await req.json()
  if (!feedback?.trim()) {
    return NextResponse.json({ error: 'Please tell us what is going on.' }, { status: 400 })
  }

  // Look up the originating request (for dealer name / email context).
  let dealerName: string | null = null
  let contactEmail: string | null = null
  let validRequestId: string | null = null
  if (requestId) {
    const { data: reqRow } = await supabase
      .from('review_requests')
      .select('id, dealer_name, contact_email')
      .eq('id', requestId)
      .maybeSingle()
    if (reqRow) {
      validRequestId = reqRow.id
      dealerName = reqRow.dealer_name
      contactEmail = reqRow.contact_email
    }
  }

  const { error } = await supabase.from('private_feedback').insert({
    request_id: validRequestId,
    dealer_name: dealerName,
    contact_email: contactEmail,
    feedback_text: feedback.trim(),
  })
  if (error) {
    console.error('private_feedback insert error:', error)
    return NextResponse.json({ error: 'Could not save your feedback — please try again.' }, { status: 500 })
  }

  // Internal alert (non-blocking).
  sendMandrillEmail({
    from_email: 'noreply@dealeraddendums.com',
    from_name: 'DealerAddendums',
    to: ALERT_RECIPIENTS.map(email => ({ email })),
    subject: `⚠️ Private feedback from ${dealerName || 'a dealer'}`,
    html: `
      <div style="font-family: Roboto, sans-serif; font-size: 14px; color: #333; max-width: 600px;">
        <div style="background: #2a2b3c; padding: 16px 24px; border-radius: 6px 6px 0 0;">
          <span style="background:#ffa500;color:#2a2b3c;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:.08em;">DA</span>
          <span style="color:#fff;font-size:14px;margin-left:10px;">Private Feedback Received</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 6px 6px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;width:120px;">Dealer</td><td style="padding:6px 0;">${dealerName || 'Unknown'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:500;color:#55595c;">Email</td><td style="padding:6px 0;">${contactEmail ? `<a href="mailto:${contactEmail}">${contactEmail}</a>` : 'Unknown'}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f5f6f7;border:1px solid #e0e0e0;border-radius:6px;color:#333;line-height:1.6;">
            ${feedback.trim().replace(/</g, '&lt;').replace(/\n/g, '<br>')}
          </div>
          <p style="font-size:12px;color:#78828c;margin:16px 0 0;">Reach out before this becomes a public review.</p>
        </div>
      </div>
    `,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
