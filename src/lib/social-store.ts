// Social queue data layer (migration 026). Queued social posts moved from
// content/social/*.json flat files into Supabase — the blog had this exact
// problem before migration 024: disk writes on the running box don't survive a
// rebuild. Service-role only (RLS default-deny, zero policies).
//
// Lifecycle: pending → approved → published, or → rejected. NOTHING may be
// handed to a posting integration unless status === 'approved' — that is the
// human gate, enforced here and in /api/social-publish.

import { supabase } from './supabase'

export type SocialPlatform = 'linkedin' | 'twitter' | 'facebook'
export type SocialStatus = 'pending' | 'approved' | 'rejected' | 'published'

export interface SocialPostRow {
  id: string
  platform: SocialPlatform
  content: string
  post_slug: string
  url: string | null
  status: SocialStatus
  scheduled_for: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Platform registry — the one place a platform is switched on. Only LinkedIn
 * is active today; the schema, queue UI and publisher stay platform-agnostic,
 * so re-adding a platform is one entry here plus its prompt + credentials.
 */
export const ACTIVE_PLATFORMS: SocialPlatform[] = ['linkedin']

/** Whether a posting integration is configured for a platform (credentials
 *  present — validity is only proven at publish time). */
export function platformConnected(platform: SocialPlatform): boolean {
  const ids: Record<SocialPlatform, string | undefined> = {
    linkedin: process.env.BUFFER_LINKEDIN_ID,
    twitter: process.env.BUFFER_TWITTER_ID,
    facebook: process.env.BUFFER_FACEBOOK_ID,
  }
  return !!process.env.BUFFER_API_KEY && !!ids[platform]
}

export async function dbListSocialPosts(): Promise<SocialPostRow[]> {
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`[social-store] list: ${error.message}`)
  return (data || []) as SocialPostRow[]
}

export async function dbGetSocialPost(id: string): Promise<SocialPostRow | null> {
  const { data, error } = await supabase.from('social_posts').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`[social-store] get: ${error.message}`)
  return (data as SocialPostRow) || null
}

/** Live (pending or approved) posts for a blog slug on a platform — the
 *  duplicate guard for generation. */
export async function dbLiveSocialPostsFor(slug: string, platform: SocialPlatform): Promise<SocialPostRow[]> {
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('post_slug', slug)
    .eq('platform', platform)
    .in('status', ['pending', 'approved'])
  if (error) throw new Error(`[social-store] liveFor: ${error.message}`)
  return (data || []) as SocialPostRow[]
}

export async function dbInsertSocialPost(row: {
  platform: SocialPlatform
  content: string
  post_slug: string
  url: string | null
  scheduled_for: string | null
}): Promise<SocialPostRow> {
  const { data, error } = await supabase
    .from('social_posts')
    .insert({ ...row, status: 'pending' })
    .select()
    .single()
  if (error) throw new Error(`[social-store] insert: ${error.message}`)
  return data as SocialPostRow
}

export async function dbUpdateSocialPost(
  id: string,
  patch: Partial<Pick<SocialPostRow, 'content' | 'status' | 'scheduled_for' | 'published_at'>>,
): Promise<SocialPostRow> {
  const { data, error } = await supabase
    .from('social_posts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`[social-store] update: ${error.message}`)
  return data as SocialPostRow
}

/** Approved posts whose scheduled time has passed — the ONLY rows the
 *  publisher may touch. */
export async function dbDueApprovedPosts(now = new Date()): Promise<SocialPostRow[]> {
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'approved')
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
  if (error) throw new Error(`[social-store] due: ${error.message}`)
  return (data || []) as SocialPostRow[]
}
