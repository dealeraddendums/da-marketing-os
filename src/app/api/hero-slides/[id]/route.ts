// Hero slides admin API — update + delete one slide.
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabase } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin-auth'
import { HERO_SLIDES_TAG, MAX_ACTIVE_SLIDES } from '@/lib/hero-slides'
import { validateSlideFields, activeCount } from '@/lib/hero-slides-admin'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  const { data: existing, error: readErr } = await supabase
    .from('hero_slides')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Slide not found' }, { status: 404 })

  const title = body.title ?? existing.title
  const description = body.description ?? existing.description
  const image_path = body.image_path ?? existing.image_path
  const is_active = typeof body.is_active === 'boolean' ? body.is_active : existing.is_active

  const invalid = validateSlideFields(title, description, image_path)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  if (is_active && !existing.is_active && (await activeCount(params.id)) >= MAX_ACTIVE_SLIDES) {
    return NextResponse.json(
      { error: `Only ${MAX_ACTIVE_SLIDES} slides can be active — deactivate one first` },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('hero_slides')
    .update({
      title: String(title).trim(),
      description: String(description).trim(),
      image_path,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(HERO_SLIDES_TAG)
  return NextResponse.json({ slide: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabase.from('hero_slides').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidateTag(HERO_SLIDES_TAG)
  return NextResponse.json({ ok: true })
}
