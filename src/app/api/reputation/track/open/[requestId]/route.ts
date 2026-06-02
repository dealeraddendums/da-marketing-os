import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

function gif() {
  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
    },
  })
}

// GET /api/reputation/track/open/:requestId  → records the open, returns pixel.
export async function GET(_req: NextRequest, { params }: { params: { requestId: string } }) {
  const { requestId } = params
  try {
    const { data: reqRow } = await supabase
      .from('review_requests')
      .select('id, opened_at, status, campaign_id')
      .eq('id', requestId)
      .maybeSingle()

    if (reqRow && !reqRow.opened_at) {
      const now = new Date().toISOString()
      // Don't downgrade a clicked/reviewed status back to 'opened'.
      const keepStatus = ['clicked_positive', 'clicked_negative', 'reviewed'].includes(reqRow.status)
      await supabase
        .from('review_requests')
        .update({ opened_at: now, status: keepStatus ? reqRow.status : 'opened', updated_at: now })
        .eq('id', requestId)

      if (reqRow.campaign_id) {
        const { data: camp } = await supabase
          .from('review_campaigns')
          .select('total_opened')
          .eq('id', reqRow.campaign_id)
          .maybeSingle()
        await supabase
          .from('review_campaigns')
          .update({ total_opened: (camp?.total_opened || 0) + 1 })
          .eq('id', reqRow.campaign_id)
      }
    }
  } catch {
    // tracking must never break the email render
  }
  return gif()
}
