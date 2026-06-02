import { NextResponse } from 'next/server'
import { syncReviewsToSupabase } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

// POST /api/reputation/gbp/sync
// Pulls reviews from Google (stub or real) and upserts them into Supabase.
export async function POST() {
  const result = await syncReviewsToSupabase()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: result.count, syncedAt: new Date().toISOString() })
}
