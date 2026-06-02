import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUS = new Set(['unread', 'read', 'replied', 'flagged'])

// PATCH /api/reputation/reviews  { reviewId, status }
// Updates a review's workflow status (e.g. mark read / flag).
export async function PATCH(req: NextRequest) {
  const { reviewId, status } = await req.json()
  if (!reviewId || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'reviewId and a valid status are required' }, { status: 400 })
  }
  const { error } = await supabase
    .from('gbp_reviews')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('review_id', reviewId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
