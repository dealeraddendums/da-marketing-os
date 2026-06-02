import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/reputation/gbp/connect
// STUB — GBP API access is pending Google approval. Once approved this becomes
// the OAuth-initiation endpoint (redirect to Google consent screen).
export async function POST() {
  return NextResponse.json({
    status: 'pending',
    message:
      'GBP API access has been requested from Google. Once approved, add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local to activate.',
  })
}
