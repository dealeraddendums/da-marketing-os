import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// RETIRED (migration 028, 2026-11-15). This was the Buffer cron publisher —
// never scheduled, and Buffer's API had been rejecting the stored key since at
// least 2026-11-12. Posting now happens at the moment of Approve in
// /api/social-queue via the direct LinkedIn integration (lib/linkedin/posts.ts),
// so a background path that could post approved rows later would be a SECOND
// way for content to reach LinkedIn — removed rather than left loaded.
//
// Kept as a tombstone (410) instead of deleted so any stale cron/bookmark gets
// a clear answer rather than a 404 that looks like a deploy problem.

export async function POST() {
  return NextResponse.json(
    {
      error: 'Gone — the cron publisher is retired. Social posts are published to ' +
        'LinkedIn at the moment of Approve in the Social Queue (/api/social-queue).',
    },
    { status: 410 },
  )
}
