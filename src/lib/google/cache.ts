// Tiny in-process cache for Google reads.
//
// Google's APIs are quota'd per day (GA4 tokens, Ads operations, GSC requests),
// and the portal re-fetches on every panel mount. Without this, opening the
// Analytics tab five times spends five times the quota for identical data.
//
// In-process (not Redis) is deliberate: da-marketing runs as a single PM2 fork,
// so one process is the whole cache. If it ever runs clustered, this becomes a
// per-worker cache — still correct, just a lower hit rate.

const DEFAULT_TTL_MS = 15 * 60 * 1000

interface Entry { value: unknown; expiresAt: number }
const store = new Map<string, Entry>()

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  { ttlMs = DEFAULT_TTL_MS, force = false }: { ttlMs?: number; force?: boolean } = {},
): Promise<{ value: T; cachedAt: number; fromCache: boolean }> {
  const now = Date.now()
  const hit = store.get(key)
  if (!force && hit && now < hit.expiresAt) {
    return { value: hit.value as T, cachedAt: hit.expiresAt - ttlMs, fromCache: true }
  }
  const value = await loader()
  store.set(key, { value, expiresAt: now + ttlMs })
  // Bound the map so a wide date-range picker cannot grow it without limit.
  if (store.size > 200) {
    // Array.from, not direct iteration: this project's tsconfig target predates
    // downlevel Map iteration.
    for (const [k, v] of Array.from(store.entries())) {
      if (v.expiresAt < now) store.delete(k)
    }
  }
  return { value, cachedAt: now, fromCache: false }
}

export function invalidatePrefix(prefix: string): void {
  for (const k of Array.from(store.keys())) if (k.startsWith(prefix)) store.delete(k)
}
