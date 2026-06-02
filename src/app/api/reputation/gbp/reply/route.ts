import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { postReplyToGoogle, deleteReplyFromGoogle } from '@/lib/gbp'

export const dynamic = 'force-dynamic'

// POST /api/reputation/gbp/reply  { reviewId, comment }
// Posts the reply to Google (stub: optimistic) and records it in Supabase.
export async function POST(req: NextRequest) {
  const { reviewId, comment } = await req.json()
  if (!reviewId || !comment?.trim()) {
    return NextResponse.json({ error: 'reviewId and comment are required' }, { status: 400 })
  }

  const ok = await postReplyToGoogle(reviewId, comment.trim())
  if (!ok) {
    return NextResponse.json({ error: 'Failed to post reply to Google' }, { status: 502 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('gbp_reviews')
    .update({ reply_comment: comment.trim(), reply_update_time: now, status: 'replied', updated_at: now })
    .eq('review_id', reviewId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/reputation/gbp/reply  { reviewId }
// Removes the reply on Google (stub) and clears reply fields in Supabase.
export async function DELETE(req: NextRequest) {
  const { reviewId } = await req.json()
  if (!reviewId) {
    return NextResponse.json({ error: 'reviewId is required' }, { status: 400 })
  }

  const ok = await deleteReplyFromGoogle(reviewId)
  if (!ok) {
    return NextResponse.json({ error: 'Failed to delete reply on Google' }, { status: 502 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('gbp_reviews')
    .update({ reply_comment: null, reply_update_time: null, status: 'read', updated_at: now })
    .eq('review_id', reviewId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
