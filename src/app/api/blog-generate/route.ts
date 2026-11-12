import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'
import { getBlogJob, runFullPostGeneration, runOutlineGeneration, startBlogJob } from '@/lib/blog-generate-job'

export const dynamic = 'force-dynamic'

// AI blog generation, async: POST starts a background job and returns 202
// {jobId}; GET ?id= polls it. The old synchronous shape held the request open
// for the whole model call (30–150s) — a spinner with no progress that died
// with the tab and hung outright when the upstream connection stalled. Same
// 202 + background + poll pattern as /api/ai-visibility/run (single PM2 fork,
// work continues in-process).

export async function POST(req: NextRequest) {
  // Admin-gated (was open): this endpoint spends model tokens on demand.
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { topic, keywords = [], mode = 'outline' } = await req.json()
  if (!topic) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }

  const kws: string[] = Array.isArray(keywords) ? keywords.filter((k: unknown) => typeof k === 'string') : []
  const job = mode === 'full'
    ? startBlogJob('full', () => runFullPostGeneration(String(topic), kws))
    : startBlogJob('outline', () => runOutlineGeneration(String(topic), kws))

  return NextResponse.json({ started: true, jobId: job.id, mode: job.kind }, { status: 202 })
}

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id') || ''
  const job = id ? getBlogJob(id) : null
  if (!job) {
    return NextResponse.json(
      { error: 'Job not found — it may have expired or the app restarted. Start the generation again.' },
      { status: 404 },
    )
  }
  return NextResponse.json({
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    ...(job.status === 'done' ? { result: job.result } : {}),
    ...(job.status === 'error' ? { error: job.error } : {}),
  })
}
