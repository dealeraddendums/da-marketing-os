// LinkedIn posting — versioned REST API (POST https://api.linkedin.com/rest/posts).
//
// Posts AS THE MEMBER (author = the connected member URN). The commentary is
// the post text WITHOUT the raw URL; the blog URL (carrying its UTM tags)
// rides in the article content block, which is what makes LinkedIn render a
// link-preview card instead of a bare pasted link.
//
// Payload composition is a pure function (composePostPayload) so the dry-run
// path (LINKEDIN_POSTING_ENABLED=false) shows the admin EXACTLY what a real
// Approve would send.

import { linkedinVersion } from './config'
import { getAccessToken, markRevoked } from './oauth'

const POSTS_URL = 'https://api.linkedin.com/rest/posts'

export interface PostPayload {
  author: string
  commentary: string
  visibility: 'PUBLIC'
  distribution: {
    feedDistribution: 'MAIN_FEED'
    targetEntities: unknown[]
    thirdPartyDistributionChannels: unknown[]
  }
  content?: {
    article: { source: string; title?: string; description?: string }
  }
  lifecycleState: 'PUBLISHED'
  isReshareDisabledByAuthor: boolean
}

/**
 * Escape LinkedIn's "Little Text Format" reserved characters in commentary.
 * Unescaped parentheses/braces/etc. make rest/posts reject the whole call with
 * an unprocessable-entity error. `#` is deliberately NOT escaped — it is how a
 * hashtag is written. Backslash goes first so the escapes themselves survive.
 */
export function escapeCommentary(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[|{}@[\]()<>*_~]/g, ch => `\\${ch}`)
}

/** Strip a raw URL out of post copy — the link belongs in the article block,
 *  not the commentary. Collapses the whitespace the URL leaves behind. */
export function commentaryWithoutUrl(content: string): string {
  return content
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function composePostPayload(input: {
  memberUrn: string
  content: string          // post text as stored (any raw URL is stripped here)
  url: string | null       // the blog URL with UTMs → article block
  title?: string | null
  description?: string | null
}): PostPayload {
  const payload: PostPayload = {
    author: input.memberUrn,
    commentary: escapeCommentary(commentaryWithoutUrl(input.content)),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }
  if (input.url) {
    payload.content = {
      article: {
        source: input.url,
        ...(input.title ? { title: input.title } : {}),
        ...(input.description ? { description: input.description } : {}),
      },
    }
  }
  return payload
}

export function permalinkFor(urn: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`
}

async function callPostsApi(payload: PostPayload, accessToken: string, version: string) {
  return fetch(POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': version,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
}

/**
 * Publish a composed payload as the connected member. Returns the post URN
 * (x-restli-id) and its permalink. Throws with LinkedIn's error message on
 * failure — the caller records it on the row so it is visible in the admin.
 */
export async function publishToLinkedin(
  payload: Omit<PostPayload, 'author'> & { author?: string },
): Promise<{ urn: string; permalink: string }> {
  const { accessToken, memberUrn } = await getAccessToken()
  const body: PostPayload = { ...payload, author: payload.author || memberUrn } as PostPayload

  let res = await callPostsApi(body, accessToken, linkedinVersion())
  // The one version edge: a brand-new month whose API version isn't cut yet.
  // LinkedIn answers 426 (or names the version in the error) — retry once with
  // last month's version, which is always live.
  if (res.status === 426 || (res.status === 400 && /version/i.test(await peekError(res)))) {
    res = await callPostsApi(body, accessToken, linkedinVersion(1))
  }

  if (res.status === 401) {
    const detail = await readError(res)
    await markRevoked(`LinkedIn rejected the token on posting: ${detail}`)
    throw new Error(`LinkedIn rejected the stored token (401) — click Reconnect LinkedIn. ${detail}`)
  }
  if (!res.ok) {
    throw new Error(`rest/posts ${res.status}: ${await readError(res)}`)
  }

  const urn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || ''
  if (!urn) throw new Error('rest/posts succeeded but returned no post id (x-restli-id header missing)')
  return { urn, permalink: permalinkFor(urn) }
}

// Response bodies can only be read once; peekError clones so the 400-version
// check doesn't consume the body the real error path needs.
async function peekError(res: Response): Promise<string> {
  try { return await res.clone().text() } catch { return '' }
}
async function readError(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const json = JSON.parse(text) as { message?: string; code?: string }
      return json.message || json.code || text.slice(0, 500)
    } catch { return text.slice(0, 500) }
  } catch { return '(no error body)' }
}
