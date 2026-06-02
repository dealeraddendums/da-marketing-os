import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/reputation/settings → { review_page_url }
export async function GET() {
  const { data, error } = await supabase
    .from('reputation_settings')
    .select('review_page_url')
    .eq('id', 1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ review_page_url: data?.review_page_url ?? null })
}

// POST /api/reputation/settings  { review_page_url }
export async function POST(req: NextRequest) {
  const { review_page_url } = await req.json()
  const { error } = await supabase
    .from('reputation_settings')
    .upsert({ id: 1, review_page_url: review_page_url || null, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
