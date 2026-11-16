import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getLinkedinStatus } from '@/lib/linkedin/oauth'

export const dynamic = 'force-dynamic'

/** GET /api/linkedin/status — admin-only connection status for the Social
 *  Queue badge. Status only: tokens never appear in any response. */
export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getLinkedinStatus())
}
