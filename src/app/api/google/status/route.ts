import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import {
  ga4Configured, gscConfigured, adsConfigured, missingEnvFor, googleEnv,
} from '@/lib/google/config'

export const dynamic = 'force-dynamic'

/** GET /api/google/status — what is configured, what is connected. Never
 *  returns a token or any secret value; only booleans and the account email. */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const connection = await getConnectionStatus()
  return NextResponse.json({
    connection,
    surfaces: {
      ga4: { configured: ga4Configured, missing: missingEnvFor('ga4') },
      gsc: { configured: gscConfigured, missing: missingEnvFor('gsc'), site: googleEnv.gscSiteUrl || null },
      ads: {
        configured: adsConfigured,
        missing: missingEnvFor('ads'),
        // Called out separately: this is the one Google approves on its own
        // schedule, so "not configured" here usually means "still waiting".
        awaitingDeveloperToken: !googleEnv.adsDeveloperToken,
      },
    },
  })
}
