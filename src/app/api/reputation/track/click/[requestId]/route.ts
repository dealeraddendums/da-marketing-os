import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getReputationSettings } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

const FALLBACK_REVIEW_URL = 'https://www.google.com/search?q=DealerAddendums+reviews'

// GET /api/reputation/track/click/:requestId?to=positive|negative
// Records the click, then redirects: positive → Google review page,
// negative → public /reputation/feedback/:requestId page.
export async function GET(req: NextRequest, { params }: { params: { requestId: string } }) {
  const { requestId } = params
  const to = req.nextUrl.searchParams.get('to') === 'negative' ? 'negative' : 'positive'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'

  try {
    const { data: reqRow } = await supabase
      .from('review_requests')
      .select('id, clicked_at, campaign_id')
      .eq('id', requestId)
      .maybeSingle()

    if (reqRow) {
      const now = new Date().toISOString()
      const newStatus = to === 'negative' ? 'clicked_negative' : 'clicked_positive'
      const firstClick = !reqRow.clicked_at
      await supabase
        .from('review_requests')
        .update({ status: newStatus, clicked_at: reqRow.clicked_at || now, updated_at: now })
        .eq('id', requestId)

      if (firstClick && reqRow.campaign_id) {
        const col = to === 'negative' ? 'total_clicked_negative' : 'total_clicked_positive'
        const { data: camp } = await supabase
          .from('review_campaigns')
          .select(col)
          .eq('id', reqRow.campaign_id)
          .maybeSingle()
        await supabase
          .from('review_campaigns')
          .update({ [col]: ((camp as Record<string, number> | null)?.[col] || 0) + 1 })
          .eq('id', reqRow.campaign_id)
      }
    }
  } catch {
    // never block the redirect on a tracking failure
  }

  if (to === 'negative') {
    return NextResponse.redirect(`${siteUrl}/reputation/feedback/${requestId}`)
  }
  const { review_page_url } = await getReputationSettings()
  return NextResponse.redirect(review_page_url || FALLBACK_REVIEW_URL)
}
