import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

interface SocialPost {
  platform: 'linkedin' | 'twitter' | 'facebook'
  content: string
  scheduledFor: string
  postSlug: string
  publishedAt?: string
}

const BUFFER_PROFILE_IDS: Record<string, string> = {
  linkedin: process.env.BUFFER_LINKEDIN_ID || '',
  twitter:  process.env.BUFFER_TWITTER_ID  || '',
  facebook: process.env.BUFFER_FACEBOOK_ID || '',
}

async function publishToBuffer(post: SocialPost): Promise<boolean> {
  const profileId = BUFFER_PROFILE_IDS[post.platform]
  if (!profileId || !process.env.BUFFER_API_KEY) return false

  const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: process.env.BUFFER_API_KEY,
      profile_ids:  profileId,
      text:         post.content,
      scheduled_at: post.scheduledFor,
    }),
  })

  return res.ok
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.DA_CRON_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const socialDir = join(process.cwd(), 'content', 'social')
  let files: string[] = []

  try {
    files = readdirSync(socialDir).filter(f => f.endsWith('.json'))
  } catch {
    return NextResponse.json({ published: 0, skipped: 0, errors: [] })
  }

  const now = new Date()
  let published = 0
  let skipped = 0
  const errors: string[] = []

  for (const file of files) {
    const filePath = join(socialDir, file)
    try {
      const posts: SocialPost[] = JSON.parse(readFileSync(filePath, 'utf-8'))

      for (const post of posts) {
        if (post.publishedAt) continue // already published
        if (new Date(post.scheduledFor) > now) continue // future

        const ok = await publishToBuffer(post)
        if (ok) {
          post.publishedAt = now.toISOString()
          published++
        } else {
          skipped++
          errors.push(`${file}: ${post.platform} publish failed`)
        }
      }

      // Write updated posts back with publishedAt timestamps
      writeFileSync(filePath, JSON.stringify(posts, null, 2))

      // Delete file if every post is now published
      if (posts.every(p => !!p.publishedAt)) {
        unlinkSync(filePath)
      }
    } catch {
      errors.push(`${file}: parse error`)
    }
  }

  return NextResponse.json({ published, skipped, errors })
}
