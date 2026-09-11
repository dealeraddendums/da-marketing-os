import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { getConnectionStatus } from '@/lib/google/oauth'
import {
  ga4Configured, gscConfigured, adsConfigured, missingEnvFor, googleEnv,
  surfaceGranted, OAUTH_SCOPES,
} from '@/lib/google/config'

export const dynamic = 'force-dynamic'

/** GET /api/google/status — what is configured, what is connected, and which
 *  scopes the stored grant actually holds. Never returns a token or any secret
 *  value; only booleans, scope names and the account email. */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const connection = await getConnectionStatus()
  const granted = connection.scopes ?? []

  return NextResponse.json({
    connection,
    /** What a reconnect would ask for, so the UI can list it before sending the
     *  operator to Google. */
    requestedScopes: OAUTH_SCOPES,
    surfaces: {
      ga4: {
        configured: ga4Configured, missing: missingEnvFor('ga4'),
        scopeGranted: surfaceGranted('ga4', granted),
      },
      gsc: {
        configured: gscConfigured,
        missing: [],
        // Informational only now — the property is resolved from Google's
        // sites.list at query time, so a wrong value here self-corrects.
        site: googleEnv.gscSiteUrl || null,
        scopeGranted: surfaceGranted('gsc', granted),
      },
      ads: {
        configured: adsConfigured,
        missing: [],
        scopeGranted: surfaceGranted('ads', granted),
        // Google retired developer tokens on 2026-09-09. Reported so the old
        // "awaiting developer token" copy can never come back.
        developerTokenRequired: false,
      },
      gbp: { scopeGranted: surfaceGranted('gbp', granted) },
      indexing: { scopeGranted: surfaceGranted('indexing', granted) },
    },
  })
}
