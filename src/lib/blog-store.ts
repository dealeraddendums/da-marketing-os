// Supabase data layer for blog posts (migration 024). Posts moved from MDX
// files into the blog_posts table so they survive deploys. Server-side only,
// via direct PostgREST calls with the service-role key (RLS default-deny; the
// service role bypasses it).
//
// Cache control matters here: the PUBLIC blog pages are ISR, so their reads use
// a cacheable fetch (next.revalidate) — a plain `no-store` would force those
// pages dynamic ("Dynamic server usage"). The ADMIN routes (editor/queue,
// read-before-write) pass fresh=true for a `no-store` read so they always see
// the current row. Writes (POST/PATCH) are never cached; the writer routes call
// revalidatePath so a publish/edit shows on the public pages promptly.
import type { BlogFrontmatter, BlogStatus } from './blog'

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PUBLIC_REVALIDATE = 300 // seconds; revalidatePath on write busts it sooner

function restHeaders(extra?: Record<string, string>) {
  return { apikey: KEY as string, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra }
}
function cacheOpt(fresh?: boolean) {
  return fresh ? { cache: 'no-store' as const } : { next: { revalidate: PUBLIC_REVALIDATE } }
}

export interface BlogRow {
  id: string
  slug: string
  title: string
  status: BlogStatus
  body_mdx: string
  excerpt: string | null
  meta_title: string | null
  meta_description: string | null
  update_notice: string | null
  editor_note: string | null
  cta: string | null
  author: string | null
  tags: string[] | null
  related: string[] | null
  previous_slugs: string[] | null
  faq: BlogFrontmatter['faq'] | null
  featured: boolean
  cover_image: string | null
  published_at: string | null
  updated_at: string | null
  review_by: string | null
  archived_at: string | null
  archived_reason: string | null
  archive_redirect_slug: string | null
  humanized_at: string | null
  created_at: string
}

const normStatus = (s?: string): BlogStatus =>
  s === 'draft' || s === 'archived' ? s : 'published'

/** Rebuild the BlogFrontmatter object the file reader used to return (only keys
 *  that have a value, matching an MDX post's frontmatter). */
export function rowToFrontmatter(r: BlogRow): BlogFrontmatter {
  const fm: BlogFrontmatter = { title: r.title, date: r.published_at || '', status: r.status }
  if (r.updated_at) fm.updatedAt = r.updated_at
  if (r.excerpt) fm.excerpt = r.excerpt
  if (r.meta_title) fm.metaTitle = r.meta_title
  if (r.meta_description) fm.metaDescription = r.meta_description
  if (r.author) fm.author = r.author
  if (r.tags && r.tags.length) fm.tags = r.tags
  if (r.cover_image) fm.coverImage = r.cover_image
  if (r.archived_at) fm.archivedAt = r.archived_at
  if (r.archived_reason) fm.archivedReason = r.archived_reason
  if (r.archive_redirect_slug) fm.archiveRedirectSlug = r.archive_redirect_slug
  if (r.previous_slugs && r.previous_slugs.length) fm.previousSlugs = r.previous_slugs
  if (r.editor_note) fm.editorNote = r.editor_note
  if (r.update_notice) fm.updateNotice = r.update_notice
  if (r.review_by) fm.reviewBy = r.review_by
  if (r.faq && (r.faq as any).length) fm.faq = r.faq as BlogFrontmatter['faq']
  if (r.related && r.related.length) fm.related = r.related
  if (r.featured) fm.featured = true
  if (r.humanized_at) fm.humanizedAt = r.humanized_at
  if (r.cta) fm.cta = r.cta
  return fm
}

function fmToColumns(slug: string, fm: BlogFrontmatter, content: string) {
  const s = (v: unknown) => (v == null || v === '' ? null : v)
  const arr = (v?: unknown[]) => (v && v.length ? v : null)
  return {
    slug,
    title: fm.title,
    status: normStatus(fm.status),
    body_mdx: content,
    excerpt: s(fm.excerpt),
    meta_title: s(fm.metaTitle),
    meta_description: s(fm.metaDescription),
    update_notice: s(fm.updateNotice),
    editor_note: s(fm.editorNote),
    cta: s(fm.cta),
    author: s(fm.author),
    tags: arr(fm.tags),
    related: arr(fm.related),
    previous_slugs: arr(fm.previousSlugs),
    faq: arr(fm.faq),
    featured: !!fm.featured,
    cover_image: s(fm.coverImage),
    published_at: s(fm.date),
    updated_at: s(fm.updatedAt),
    review_by: s(fm.reviewBy),
    archived_at: s(fm.archivedAt),
    archived_reason: s(fm.archivedReason),
    archive_redirect_slug: s(fm.archiveRedirectSlug),
    humanized_at: s(fm.humanizedAt),
  }
}

export async function dbGetPost(slug: string, fresh?: boolean): Promise<BlogRow | null> {
  try {
    const res = await fetch(`${BASE}/rest/v1/blog_posts?select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: restHeaders(), ...cacheOpt(fresh) })
    if (!res.ok) { console.error('[blog-store] getPost', res.status, (await res.text()).slice(0, 200)); return null }
    const rows = (await res.json()) as BlogRow[]
    return rows[0] || null
  } catch (e) { console.error('[blog-store] getPost error', e); return null }
}

export async function dbGetAllPosts(fresh?: boolean): Promise<BlogRow[]> {
  try {
    const res = await fetch(`${BASE}/rest/v1/blog_posts?select=*`, { headers: restHeaders(), ...cacheOpt(fresh) })
    if (!res.ok) { console.error('[blog-store] getAllPosts', res.status, (await res.text()).slice(0, 200)); return [] }
    return (await res.json()) as BlogRow[]
  } catch (e) { console.error('[blog-store] getAllPosts error', e); return [] }
}

export async function dbSlugExists(slug: string): Promise<boolean> {
  const r = await dbGetPost(slug, true)
  return !!r
}

/** Insert-or-update by slug. Returns the row (with id). */
export async function dbSavePost(slug: string, fm: BlogFrontmatter, content: string): Promise<BlogRow> {
  const res = await fetch(`${BASE}/rest/v1/blog_posts?on_conflict=slug`, {
    method: 'POST',
    headers: restHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(fmToColumns(slug, fm, content)),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`[blog-store] savePost ${res.status}: ${text.slice(0, 200)}`)
  return (JSON.parse(text) as BlogRow[])[0]
}

/** Rename: update the existing row (by oldSlug) to newSlug + fields. Same id, so
 *  the revision history (FK → id) follows automatically. */
export async function dbRenamePost(oldSlug: string, newSlug: string, fm: BlogFrontmatter, content: string): Promise<BlogRow> {
  const res = await fetch(`${BASE}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(oldSlug)}`, {
    method: 'PATCH',
    headers: restHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(fmToColumns(newSlug, fm, content)),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`[blog-store] renamePost ${res.status}: ${text.slice(0, 200)}`)
  return (JSON.parse(text) as BlogRow[])[0]
}
