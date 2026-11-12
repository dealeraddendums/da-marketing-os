import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { runSiteCheck } from '@/lib/ai-visibility/site-check'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/ai-visibility/site-check — one-click "Site readiness" report:
 * robots.txt rules for the AI crawlers, /llms.txt presence, and JSON-LD
 * structured data on the homepage + newest blog post. Report only — it
 * changes nothing.
 */
export async function GET() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await runSiteCheck())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Check failed' }, { status: 500 })
  }
}
