// Server-side helpers shared by the hero-slides admin API routes.
import { supabase } from '@/lib/supabase'

export const TITLE_MAX = 60
export const DESC_MAX = 200

export function validateSlideFields(title: unknown, description: unknown, imagePath: unknown): string | null {
  if (typeof title !== 'string' || !title.trim()) return 'Title is required'
  if (title.length > TITLE_MAX) return `Title must be ${TITLE_MAX} characters or fewer`
  if (typeof description !== 'string' || !description.trim()) return 'Description is required'
  if (description.length > DESC_MAX) return `Description must be ${DESC_MAX} characters or fewer`
  if (typeof imagePath !== 'string' || !/^\/images\/(hero\/)?[\w.-]+\.(png|jpe?g|webp)$/i.test(imagePath)) {
    return 'Image is required — upload one first'
  }
  return null
}

export async function activeCount(excludeId?: string): Promise<number> {
  let q = supabase.from('hero_slides').select('id', { count: 'exact', head: true }).eq('is_active', true)
  if (excludeId) q = q.neq('id', excludeId)
  const { count } = await q
  return count ?? 0
}
