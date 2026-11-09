// Revision log for blog posts — blog_post_revisions (migration 023).
// Posts live as MDX files; this table is the append-only history behind them.
//
// Policy (who writes a row, enforced by the admin routes):
//   - every save of a PUBLISHED post        → event 'save'
//   - every publish (draft → published)     → event 'publish'
//   - unpublish / archive / restore         → their own events
//   - slug rename                           → event 'slug_change' under the NEW slug
//   - saves of a DRAFT                      → no row (drafts are logged on publish only)
//
// A revision snapshots the full frontmatter + body so Restore can reproduce
// the post exactly. Failures are logged and never fail the editor action —
// losing one history row is better than blocking a save.
import { createClient } from '@supabase/supabase-js'
import type { BlogFrontmatter } from './blog'

// ⚠️ Own client with cache:'no-store' on every request. Next 14 patches
// global fetch with its file-backed Data Cache, and supabase-js SELECTs are
// GETs keyed on the PostgREST URL — so the shared client's reads can return
// STALE rows even in a force-dynamic route (verified live 2026-11-09: raw
// PostgREST showed 6 revision rows while the app route kept answering with a
// cached 2). Writes (POST/PATCH) are never cached, which is why inserts
// worked while the history listing froze.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
)

export type RevisionEvent = 'save' | 'publish' | 'unpublish' | 'archive' | 'restore' | 'slug_change'

export interface BlogRevision {
  id: string
  slug: string
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
  slug: string
  event: RevisionEvent
  frontmatter: BlogFrontmatter
  body: string
  changeSummary?: string
  savedBy?: string
}): Promise<void> {
  const { error } = await supabase.from('blog_post_revisions').insert({
    slug: args.slug,
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

/** On a slug rename, move the post's history to the new slug (the slug is the
 *  post's identity, so the trail must follow it). Logged, never throws. */
export async function rekeyRevisions(oldSlug: string, newSlug: string): Promise<void> {
  const { error } = await supabase
    .from('blog_post_revisions')
    .update({ slug: newSlug })
    .eq('slug', oldSlug)
  if (error) console.error('[blog-revisions] rekey failed:', error.message)
}

export async function listRevisions(slug: string, limit = 50): Promise<BlogRevision[]> {
  const { data, error } = await supabase
    .from('blog_post_revisions')
    .select('*')
    .eq('slug', slug)
    .order('saved_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[blog-revisions] list failed:', error.message)
    return []
  }
  return (data || []) as BlogRevision[]
}
