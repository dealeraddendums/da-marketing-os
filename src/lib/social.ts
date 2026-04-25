// Buffer API helpers for social publishing

export interface BufferPost {
  profileId: string
  text: string
  scheduledAt?: string
}

export async function createBufferUpdate(post: BufferPost): Promise<{ id: string } | null> {
  const apiKey = process.env.BUFFER_API_KEY
  if (!apiKey) return null

  const body = new URLSearchParams({
    access_token: apiKey,
    profile_ids:  post.profileId,
    text:         post.text,
  })
  if (post.scheduledAt) {
    body.set('scheduled_at', post.scheduledAt)
  }

  const res = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) return null
  const data = await res.json()
  return { id: data.id }
}
