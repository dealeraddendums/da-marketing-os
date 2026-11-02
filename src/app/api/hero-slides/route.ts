// Hero slides admin API — list + create. Admin cookie required (the homepage
// never reads this route; it reads the table server-side via lib/hero-slides).
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin-auth'
import { HERO_SLIDES_TAG, MAX_ACTIVE_SLIDES } from '@/lib/hero-slides'
import { validateSlideFields, activeCount } from '@/lib/hero-slides-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('hero_slides')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ slides: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const { title, description, image_path, is_active = true } = body

  const invalid = validateSlideFields(title, description, image_path)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  if (is_active && (await activeCount()) >= MAX_ACTIVE_SLIDES) {
    return NextResponse.json(
      { error: `Only ${MAX_ACTIVE_SLIDES} slides can be active — deactivate one first` },
      { status: 400 },
    )
  }

  // Append at the end of the current order.
  const { data: last } = await supabase
    .from('hero_slides')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('hero_slides')
    .insert({
      title: title.trim(),
      description: description.trim(),
      image_path,
      is_active: !!is_active,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(HERO_SLIDES_TAG)
  return NextResponse.json({ slide: data })
}
