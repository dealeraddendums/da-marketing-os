import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/leads-list — recent marketing leads for the dashboard table.
 * Admin-only (exposes name/dealership + AI enrichment). Returns the 50 most
 * recent rows plus the total count.
 */
export async function GET() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { count } = await supabase
    .from('marketing_leads')
    .select('id', { count: 'exact', head: true })

  const { data, error } = await supabase
    .from('marketing_leads')
    .select('id, name, dealership, source, status, created_at, ai_enrichment')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data ?? [], total: count ?? 0 })
}
