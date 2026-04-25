interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>()

export function rateLimit(ip: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = store.get(ip)
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= max) return false
  entry.count++
  return true
}
