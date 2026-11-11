// Revision log for blog posts — blog_post_revisions (migration 024, reshaped
// from slug-keyed to post_id-keyed FK → blog_posts.id). A snapshot is written
// on publish, on every save of a published post, on unpublish/archive/restore,
// and on a humanized save. The row snapshots the full frontmatter + body so
// Restore reproduces the post exactly. Because it keys on the stable post id,
// a slug rename needs no re-keying — the history follows the post.
//
// Own client with cache:'no-store' (Next 14 patches global fetch with its Data
// Cache; supabase-js SELECTs are GETs and would otherwise return stale rows).
// Failures are logged and never thrown — losing one history row beats blocking
// an editor action.
import { createClient } from '@supabase/supabase-js'
import type { BlogFrontmatter } from './blog'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
)

export type RevisionEvent = 'save' | 'publish' | 'unpublish' | 'archive' | 'restore' | 'slug_change'

export interface BlogRevision {
  id: string
  post_id: string
  event: RevisionEvent
  title: string | null
  meta_title: string | null
  meta_description: string | null
  body: string
  frontmatter: BlogFrontmatter
  change_summary: string | null
  saved_by: string | null
  saved_at: string
}

export async function writeRevision(args: {
  postId?: string
  event: RevisionEvent
  frontmatter: BlogFrontmatter
  body: string
  changeSummary?: string
  savedBy?: string
}): Promise<void> {
  if (!args.postId) {
    // No post id (e.g. a files-mode rollback has no DB row) — nothing to key on.
    console.warn('[blog-revisions] skipped: no postId')
    return
  }
  const { error } = await supabase.from('blog_post_revisions').insert({
    post_id: args.postId,
    event: args.event,
    title: args.frontmatter.title ?? null,
    meta_title: args.frontmatter.metaTitle ?? null,
    meta_description: args.frontmatter.metaDescription ?? null,
    body: args.body,
    frontmatter: args.frontmatter,
    change_summary: args.changeSummary ?? null,
    saved_by: args.savedBy ?? 'admin',
  })
  if (error) console.error('[blog-revisions] insert failed:', error.message)
}

export async function listRevisions(postId: string, limit = 50): Promise<BlogRevision[]> {
  const { data, error } = await supabase
    .from('blog_post_revisions')
    .select('*')
    .eq('post_id', postId)
    .order('saved_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[blog-revisions] list failed:', error.message)
    return []
  }
  return (data || []) as BlogRevision[]
}
