import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { supabase } from '@/lib/supabase'
import { getBlogJob, startBlogJob } from '@/lib/blog-generate-job'
import { findExistingGapDraft, gapBaseSlug, generateGapArticle } from '@/lib/ai-visibility/gap-article'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai-visibility/gap-to-blog { prompt_id }
 *
 * Turn a visibility gap into a REAL generated draft (no more one-line stubs):
 * the full article pipeline runs in the background (202 + poll
 * GET /api/blog-generate?id=, the generator's job store) with the gap context
 * — the dealer prompt verbatim, engines lost, competitors named, top cited
 * domains — gathered server-side from the latest run. The rationale lands in
 * the internal editor note; the public body answers the dealer's question and
 * nothing else. Still a draft: Allan publishes by hand.
 *
 * Idempotent: a second click returns the existing generated draft (200,
 * existing: true); earlier stubs in the slug family are archived by the job.
 */

// One in-flight generation per prompt — a double click polls the same job.
const inFlight = new Map<string, string>() // prompt_id → jobId

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { prompt_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const promptId = body.prompt_id || ''
  if (!/^[0-9a-f-]{36}$/i.test(promptId)) {
    return NextResponse.json({ error: 'prompt_id required' }, { status: 400 })
  }

  const { data: prompt, error } = await supabase.from('ai_visibility_prompts')
    .select('id, prompt_text')
    .eq('id', promptId)
    .single()
  if (error || !prompt) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })

  const slug = gapBaseSlug(prompt.prompt_text)

  // Second click, draft already generated → open that one.
  const existing = await findExistingGapDraft(slug)
  if (existing) {
    return NextResponse.json({ ok: true, existing: true, slug: existing.slug, title: existing.title })
  }

  // Second click while the first is still generating → same job.
  const runningId = inFlight.get(promptId)
  const running = runningId ? getBlogJob(runningId) : null
  if (running && running.status === 'running') {
    return NextResponse.json({ started: true, jobId: running.id, slug }, { status: 202 })
  }

  const job = startBlogJob('gap', async () => {
    try {
      return await generateGapArticle(promptId)
    } finally {
      inFlight.delete(promptId)
    }
  })
  inFlight.set(promptId, job.id)

  return NextResponse.json({ started: true, jobId: job.id, slug }, { status: 202 })
}
