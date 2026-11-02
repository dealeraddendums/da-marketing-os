// Hero slides admin API — persist a new order (array of slide ids as shown).
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin-auth'
import { HERO_SLIDES_TAG } from '@/lib/hero-slides'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids: unknown = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'ids must be a non-empty array of slide ids' }, { status: 400 })
  }

  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase
      .from('hero_slides')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', ids[i])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateTag(HERO_SLIDES_TAG)
  return NextResponse.json({ ok: true })
}
