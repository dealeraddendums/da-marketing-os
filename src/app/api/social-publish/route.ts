import { NextRequest, NextResponse } from 'next/server'
import { dbDueApprovedPosts, dbUpdateSocialPost, platformConnected, type SocialPostRow } from '@/lib/social-store'

export const dynamic = 'force-dynamic'

// The publisher. Cron-key gated; nothing schedules it today (no crontab, no
// EasyCron job, no PM2 cron), and no posting integration is connected — this
// route is the ONLY thing that could ever post externally, and it only ever
// touches rows a human explicitly set to 'approved' in the Social Queue
// (status gate enforced in dbDueApprovedPosts). Pending posts are invisible to
// it by construction.
//
// Integration: Buffer (legacy). BUFFER_API_KEY is present on the box but
// Buffer's API rejects it (401, verified 2026-11-12) and no per-platform
// profile ids are set — publishToBuffer() returns false for every platform, so
// even a manual authenticated call publishes nothing. Replacing Buffer with a
// direct LinkedIn integration means swapping publishToBuffer only.

const BUFFER_PROFILE_IDS: Record<string, string> = {
  linkedin: process.env.BUFFER_LINKEDIN_ID || '',
  twitter:  process.env.BUFFER_TWITTER_ID  || '',
  facebook: process.env.BUFFER_FACEBOOK_ID || '',
}

async function publishToBuffer(post: SocialPostRow): Promise<boolean> {
  const profileId = BUFFER_PROFILE_IDS[post.platform]
  if (!profileId || !process.env.BUFFER_API_KEY) return false

  const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: process.env.BUFFER_API_KEY,
      profile_ids:  profileId,
      text:         post.content,
    }),
  })
  return res.ok
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || !process.env.DA_CRON_KEY || apiKey !== process.env.DA_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = await dbDueApprovedPosts()
  let published = 0
  let skipped = 0
  const errors: string[] = []

  for (const post of due) {
    if (!platformConnected(post.platform)) {
      skipped++
      errors.push(`${post.id}: ${post.platform} is not connected`)
      continue
    }
    try {
      const ok = await publishToBuffer(post)
      if (ok) {
        await dbUpdateSocialPost(post.id, { status: 'published', published_at: new Date().toISOString() })
        published++
      } else {
        skipped++
        errors.push(`${post.id}: ${post.platform} publish failed`)
      }
    } catch (e) {
      skipped++
      errors.push(`${post.id}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return NextResponse.json({ due: due.length, published, skipped, errors })
}
