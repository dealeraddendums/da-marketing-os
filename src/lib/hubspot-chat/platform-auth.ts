import crypto from 'crypto'

// da-platform ↔ marketing server-to-server calls for the chat bridge. Both
// apps already share MARKETING_WEBHOOK_SECRET (X-Webhook-Secret); no new
// credential is minted for this.

export function platformSecretOk(given: string | null): boolean {
  const want = process.env.MARKETING_WEBHOOK_SECRET
  if (!want || !given) return false
  const a = Buffer.from(want)
  const b = Buffer.from(given)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** POST JSON to da-platform with the shared secret. Never throws. */
export async function postToPlatform(path: string, body: unknown, timeoutMs = 15_000): Promise<{ ok: boolean; status: number; data: unknown }> {
  const base = (process.env.DA_PLATFORM_URL || 'https://app.dealeraddendums.com').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': process.env.MARKETING_WEBHOOK_SECRET || '' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, data: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}
