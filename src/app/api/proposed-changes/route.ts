import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/proposed-changes?status=pending — the approval queue.
 *
 * Phase 1 has no producers, so this correctly returns an empty list. The
 * endpoint and its shape exist now so Phase 2 (Ads writes) and Phase 3 (AI
 * recommendations) can start inserting rows without any UI or API rework.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status') || 'pending'
  let q = supabase
    .from('proposed_changes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status !== 'all') q = q.eq('status', status)

  const { data, error } = await q
  if (error) {
    // Migration 009 not applied yet is the likely cause; report it as an empty
    // queue with a note rather than a red error the operator cannot act on.
    return NextResponse.json({ changes: [], error: error.message }, { status: 200 })
  }
  return NextResponse.json({ changes: data ?? [] })
}
