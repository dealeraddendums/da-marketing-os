import { NextRequest, NextResponse } from 'next/server'
import { syncReviewsToSupabase } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

// POST /api/cron/sync-reviews
// EasyCron daily at 08:00 UTC. Auth: x-api-key header === DA_CRON_KEY.
// Works today against mock GBP data; becomes a live Google sync once GBP is connected.
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.DA_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await syncReviewsToSupabase()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: result.count, syncedAt: new Date().toISOString() })
}
