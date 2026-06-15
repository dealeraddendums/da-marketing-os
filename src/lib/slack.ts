import crypto from 'crypto'

// Slack Web API + Events verification for two-way live chat.
// Threading (post a parent, reply in-thread, read replies) needs a real Slack
// app — the bot token (xoxb-…) — NOT the Workflow Builder/Incoming Webhook used
// by the notify-only fallback. See chat-live-twoway.md.

const SLACK_API = 'https://slack.com/api'

export function slackConfigured(): boolean {
  return !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_ALERTS_CHANNEL)
}

/**
 * Post a message with the bot token. With no threadTs it posts a top-level
 * message (the alert that anchors the thread); with threadTs it replies in
 * that thread. Returns the message ts so the caller can store/anchor it.
 */
export async function postSlackMessage(opts: {
  channel: string
  text: string
  threadTs?: string | null
}): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return { ok: false, error: 'no_bot_token' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: opts.channel,
        text: opts.text,
        ...(opts.threadTs ? { thread_ts: opts.threadTs } : {}),
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!data?.ok) return { ok: false, error: data?.error || `http_${res.status}` }
    return { ok: true, ts: data.ts, channel: data.channel }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Verify a Slack Events request signature (v0 HMAC over `v0:timestamp:body`)
 * against SLACK_SIGNING_SECRET. Rejects requests older than 5 minutes (replay
 * guard). `rawBody` MUST be the exact bytes Slack sent — parse JSON only after
 * this passes.
 */
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret || !timestamp || !signature) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(Date.now() / 1000 - ts) > 60 * 5) return false // replay guard

  const base = `v0:${timestamp}:${rawBody}`
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex')

  // Constant-time compare; bail if lengths differ (timingSafeEqual throws).
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
