import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai-visibility/result?id=<result uuid>
 *
 * The raw engine answer for one grid cell — fetched on click rather than
 * shipped with the grid (a full run is ~100 answers ≈ 200 KB of text).
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  }
  const { data, error } = await supabase.from('ai_visibility_results')
    .select('id, engine, model, raw_answer, da_mentioned, da_cited_url, competitors_mentioned, cited_domains, position_rank, latency_ms, token_cost_usd, error, created_at')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ result: data })
}
