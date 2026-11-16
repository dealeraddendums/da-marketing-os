// Social queue data layer (migration 026). Queued social posts moved from
// content/social/*.json flat files into Supabase — the blog had this exact
// problem before migration 024: disk writes on the running box don't survive a
// rebuild. Service-role only (RLS default-deny, zero policies).
//
// Lifecycle: pending → approved → published, or → rejected / failed. Posting
// happens ON APPROVE in /api/social-queue (direct LinkedIn integration,
// migration 028) — a 'failed' row carries post_error and can be retried.
// NOTHING is ever sent to LinkedIn except by an explicit Approve/Post click.

import { supabase } from './supabase'

export type SocialPlatform = 'linkedin' | 'twitter' | 'facebook'
export type SocialStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'failed'

export interface SocialPostRow {
  id: string
  platform: SocialPlatform
  content: string
  post_slug: string
  url: string | null
  status: SocialStatus
  scheduled_for: string | null
  published_at: string | null
  post_urn: string | null    // x-restli-id returned by LinkedIn rest/posts
  permalink: string | null   // linkedin.com/feed/update/{urn}/
  post_error: string | null  // last publish failure, shown in the admin
  created_at: string
  updated_at: string
}

/**
 * Platform registry — the one place a platform is switched on. Only LinkedIn
 * is active today; the schema and queue UI stay platform-agnostic, so
 * re-adding a platform is one entry here plus its prompt + credentials.
 */
export const ACTIVE_PLATFORMS: SocialPlatform[] = ['linkedin']

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
  content: string
  post_slug: string
  url: string | null
  scheduled_for: string | null
}): Promise<SocialPostRow> {
  // LinkedIn-only as of 2026-11-12: the channel is set HERE, on the single
  // write path — no caller can create a twitter/facebook row. The old rows
  // keep their platform value (type + DB check unchanged) for history.
  const { data, error } = await supabase
    .from('social_posts')
    .insert({ ...row, platform: 'linkedin', status: 'pending' })
    .select()
    .single()
  if (error) throw new Error(`[social-store] insert: ${error.message}`)
  return data as SocialPostRow
}

/** When the most recent LinkedIn post actually went out — the 24h pacing
 *  soft guard reads this (warn, never block). */
export async function dbLastLinkedinPublishedAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from('social_posts')
    .select('published_at')
    .eq('platform', 'linkedin')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[social-store] lastPublished: ${error.message}`)
  return data?.published_at || null
}

export async function dbUpdateSocialPost(
  id: string,
  patch: Partial<Pick<SocialPostRow,
    'content' | 'status' | 'scheduled_for' | 'published_at' | 'post_urn' | 'permalink' | 'post_error'>>,
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

