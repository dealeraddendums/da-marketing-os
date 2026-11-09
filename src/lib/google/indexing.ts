// Google Indexing API — URL submission on blog publish.
//
// Uses the same stored OAuth grant as Ads/GA4/GSC (google_connection). The
// `https://www.googleapis.com/auth/indexing` scope was granted on the live
// connection 2026-11-03 (reconnect), so no service account is involved —
// same model as every other Google surface in this repo.
//
// ⚠️ Google documents the Indexing API as being for JobPosting /
// BroadcastEvent pages. Submitting ordinary articles is widely done and the
// API accepts it, but Google may ignore the hint — treat this as "ask Google
// to look soon", not a guarantee. The sitemap remains the canonical signal.
//
// Follows the house rules from lib/google/ads.ts: read the response as text
// first (Google answers HTML when an API is disabled), log the complete error
// body, and surface failure states as readable results — a failed indexing
// ping must never fail a publish.
import { getAccessToken } from './oauth'

export interface IndexingResult {
  ok: boolean
  url: string
  status: number
  detail?: string
}

export async function submitUrlForIndexing(url: string): Promise<IndexingResult> {
  let token: string
  try {
    token = await getAccessToken()
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[google-indexing] no access token:', detail)
    return { ok: false, url, status: 0, detail: `No Google access token: ${detail}` }
  }

  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`[google-indexing] publish failed for ${url}: HTTP ${res.status} — ${text}`)
    let detail = text
    try {
      const parsed = JSON.parse(text)
      detail = parsed?.error?.message || text
    } catch { /* keep raw text */ }
    return { ok: false, url, status: res.status, detail }
  }

  console.log(`[google-indexing] submitted ${url} (HTTP ${res.status})`)
  return { ok: true, url, status: res.status }
}
