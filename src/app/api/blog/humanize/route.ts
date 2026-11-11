import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getPost } from '@/lib/blog'
import { writeRevision } from '@/lib/blog-revisions'
import { humanizeMarkdown, PhraslyError } from '@/lib/phrasly'

export const dynamic = 'force-dynamic'

// "Humanize with Phrasly" — rewrites the editor's current Body through
// Phrasly (prose only; structure protected, see lib/phrasly.ts) and returns
// the result for REVIEW. Nothing is written to the post file here: the editor
// replaces its textarea and Allan saves (or undoes) himself.
//
// Provenance: when the post exists on disk, the PRE-humanize body is
// snapshotted into the revision log first (even for drafts, which normally
// log on publish only) so the generator's original output stays retrievable
// from the Revisions list regardless of what gets saved afterwards.
//
// Errors surface Phrasly's own status + message (401 bad key, 402/403 out of
// credits, 429 rate limit, 5xx) instead of a generic failure.
function friendly(e: PhraslyError): string {
  if (e.status === 401) return `Phrasly rejected the API key (401) — check PHRASLY_API_KEY. (${e.message})`
  if (e.status === 402 || e.status === 403) return `Phrasly refused the request (${e.status}) — likely out of credits: ${e.message}`
  if (e.status === 429) return `Phrasly rate limit hit (429) — wait a few seconds and try again. (${e.message})`
  if (e.status >= 500 && e.status < 600 && e.status !== 502 && e.status !== 503) return `Phrasly server error (${e.status}): ${e.message}`
  return e.message
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Record<string, any>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { body, slug } = payload as { body?: string; slug?: string }
  if (!body || typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  // Snapshot the pre-humanize body into the revision log so the original is
  // always retrievable (writeRevision logs failures and never throws).
  const existing = slug && typeof slug === "string" ? await getPost(slug, true) : null
  if (existing) {
    await writeRevision({
      postId: existing.id,
      event: 'save',
      frontmatter: existing.frontmatter,
      body,
      changeSummary: 'Pre-humanize snapshot — body before "Humanize with Phrasly"',
      savedBy: 'phrasly',
    })
  }

  try {
    const result = await humanizeMarkdown(body)
    console.log(`[phrasly] humanized slug=${existing?.slug || '(unsaved)'} wordsSent=${result.wordsSent} chunks=${result.chunks}`)
    return NextResponse.json(result)
  } catch (e: any) {
    if (e instanceof PhraslyError) {
      console.error(`[phrasly] humanize failed slug=${existing?.slug || '(unsaved)'} status=${e.status}: ${e.message}`)
      const status = e.status >= 400 && e.status < 600 ? e.status : 502
      return NextResponse.json({ error: friendly(e) }, { status })
    }
    console.error('[phrasly] humanize failed:', e)
    return NextResponse.json({ error: `Humanize failed — ${e?.message || e}` }, { status: 500 })
  }
}
