import { NextRequest, NextResponse } from 'next/server'
import { getSegmentDealers, Segment } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

// GET /api/reputation/requests/preview?segment=active_90_days
// Returns how many dealers a segment will reach (read-only DA Platform query).
export async function GET(req: NextRequest) {
  const segment = (req.nextUrl.searchParams.get('segment') || 'all_active') as Segment
  if (segment === 'manual') {
    return NextResponse.json({ connected: true, count: 0, note: 'Manual upload — count is based on pasted emails.' })
  }
  const { connected, dealers } = await getSegmentDealers(segment)
  return NextResponse.json({
    connected,
    count: dealers.length,
    note: connected
      ? undefined
      : 'DA Platform Supabase is not configured. Add DA_PLATFORM_SUPABASE_URL and DA_PLATFORM_SUPABASE_SERVICE_KEY to .env.local to enable dealer segments.',
  })
}
