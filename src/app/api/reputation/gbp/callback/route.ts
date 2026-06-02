import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/reputation/gbp/callback
// STUB — OAuth callback. Once GBP access is approved this exchanges the auth
// code for tokens and stores them in gbp_credentials.
export async function GET() {
  return NextResponse.json({
    status: 'pending',
    message:
      'GBP API access has been requested from Google. Once approved, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local to activate.',
  })
}
