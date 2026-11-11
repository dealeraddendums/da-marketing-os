// Shared blog-post reader.
//
// Storage moved from MDX files to the database (migration 024): posts live in
// Supabase `blog_posts` so they survive a deploy (the editor/generator write
// on the running box, and a deploy wipes uncommitted disk writes). The MDX
// body is stored as text and compiled at render exactly as before.
//
// BLOG_SOURCE selects the read source:
//   'supabase' (default) — read blog_posts (the source of truth).
//   'files'              — read the frozen content/posts/*.mdx snapshot. The
//                          instant rollback: set BLOG_SOURCE=files + redeploy.
// The file-read path is kept intact through burn-in; a later cleanup PR removes
// it with the files. Writes always go to the DB (see lib/blog-store.ts); files
// are never written anymore (no dual-write — drift risk).
//
// Lifecycle fields (frontmatter in file mode, columns in DB mode, same meaning):
//   status draft|published|archived (absent = published, legacy) · updatedAt ·
//   archivedAt/archivedReason/archiveRedirectSlug · previousSlugs · editorNote
//   (internal) · updateNotice (public banner) · metaTitle · reviewBy · faq ·
//   related · featured · humanizedAt · cta.
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { dbGetPost, dbGetAllPosts, rowToFrontmatter, type BlogRow } from './blog-store'

export interface BlogFaqItem {
  q: string
  a: string
}

export type BlogStatus = 'draft' | 'published' | 'archived'

export interface BlogFrontmatter {
  title: string
  date: string
  excerpt?: string
  metaTitle?: string
  metaDescription?: string
  author?: string
  tags?: string[]
  coverImage?: string
  status?: BlogStatus
  updatedAt?: string
  archivedAt?: string
  archivedReason?: string
  archiveRedirectSlug?: string
  previousSlugs?: string[]
  editorNote?: string
  updateNotice?: string
  reviewBy?: string
  faq?: BlogFaqItem[]
  related?: string[]
  featured?: boolean
  /** ISO timestamp of the last save whose body came from "Humanize with Phrasly". */
  humanizedAt?: string
  /** One-sentence closing CTA; the post page renders it as the CTA card. */
  cta?: string
}

export interface BlogPost {
  /** DB row id (supabase mode only; undefined in files mode). */
  id?: string
  slug: string
  frontmatter: BlogFrontmatter
  content: string
  readingTime: string
  status: BlogStatus
  /** Kept for existing call sites: true only for status === 'draft'. */
  draft: boolean
}

const BLOG_SOURCE: 'supabase' | 'files' =
  process.env.BLOG_SOURCE === 'files' ? 'files' : 'supabase'

export const POSTS_DIR = () => join(process.cwd(), 'content', 'posts')

export function postStatus(fm: BlogFrontmatter): BlogStatus {
  if (fm.status === 'draft' || fm.status === 'archived') return fm.status
  return 'published' // absent or explicit "published" — legacy posts have no status field
}

export function isDraft(fm: BlogFrontmatter): boolean {
  return postStatus(fm) === 'draft'
}

export function isPublished(fm: BlogFrontmatter): boolean {
  return postStatus(fm) === 'published'
}

function readingTime(content: string): string {
  // Count real words: drop markdown/MDX syntax (fences, link URLs, images,
  // headings/markers, inline punctuation), then estimate at ~225 wpm.
  const prose = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
  const words = prose.trim().split(/\s+/).filter(Boolean).length
  const mins = Math.max(1, Math.round(words / 225))
  return `${mins} min read`
}

export function safeSlug(slug: string): string {
  return (slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function postFilePath(slug: string): string | null {
  const safe = slug.replace(/[^a-z0-9-]/gi, '')
  if (!safe) return null
  const mdx = join(POSTS_DIR(), `${safe}.mdx`)
  const md = join(POSTS_DIR(), `${safe}.md`)
  return existsSync(mdx) ? mdx : existsSync(md) ? md : null
}

function toBlogPost(slug: string, fm: BlogFrontmatter, content: string, id?: string): BlogPost {
  const status = postStatus(fm)
  return { id, slug, frontmatter: fm, content, readingTime: readingTime(content), status, draft: status === 'draft' }
}

function rowToPost(row: BlogRow): BlogPost {
  return toBlogPost(row.slug, rowToFrontmatter(row), row.body_mdx, row.id)
}

// ── File-mode (rollback) readers ──────────────────────────────────────────────
function getPostFromFile(slug: string): BlogPost | null {
  const filePath = postFilePath(slug)
  if (!filePath) return null
  const { data, content } = matter(readFileSync(filePath, 'utf-8'))
  return toBlogPost(slug, data as BlogFrontmatter, content)
}

function getAllPostsFromFiles(): BlogPost[] {
  try {
    const files = readdirSync(POSTS_DIR()).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    const posts: BlogPost[] = []
    for (const f of files) {
      const post = getPostFromFile(f.replace(/\.(mdx|md)$/, ''))
      if (post) posts.push(post)
    }
    return posts
  } catch {
    return []
  }
}

// ── Public readers (async; branch on BLOG_SOURCE) ─────────────────────────────
export async function getPost(slug: string, fresh = false): Promise<BlogPost | null> {
  if (BLOG_SOURCE === 'files') return getPostFromFile(slug)
  const row = await dbGetPost(slug, fresh)
  return row ? rowToPost(row) : null
}

/**
 * Posts, newest first. By default only PUBLISHED. includeDrafts/includeArchived
 * widen the set (admin queue, route map, sibling previews).
 */
export async function getAllPosts(opts: { includeDrafts?: boolean; includeArchived?: boolean; fresh?: boolean } = {}): Promise<BlogPost[]> {
  const all = BLOG_SOURCE === 'files'
    ? getAllPostsFromFiles()
    : (await dbGetAllPosts(opts.fresh)).map(rowToPost)
  return all
    .filter(p => {
      if (p.status === 'draft' && !opts.includeDrafts) return false
      if (p.status === 'archived' && !opts.includeArchived) return false
      return true
    })
    .sort((a, b) => {
      const da = new Date(a.frontmatter.date || 0).getTime()
      const db = new Date(b.frontmatter.date || 0).getTime()
      return db - da
    })
}

/** Related posts: frontmatter `related` first (archived skipped), topped up with newest published. */
export async function getRelatedPosts(slug: string, limit = 3): Promise<BlogPost[]> {
  const self = await getPost(slug)
  const out: BlogPost[] = []
  const seen = new Set<string>([slug])
  for (const rel of self?.frontmatter.related || []) {
    if (seen.has(rel)) continue
    const p = await getPost(rel)
    if (p && p.status !== 'archived') {
      out.push(p)
      seen.add(rel)
    }
    if (out.length >= limit) return out
  }
  for (const p of await getAllPosts()) {
    if (out.length >= limit) break
    if (seen.has(p.slug)) continue
    out.push(p)
    seen.add(p.slug)
  }
  return out
}

/** Published featured posts for the homepage footer Resources row. */
export async function getFooterPosts(limit = 3): Promise<Array<{ slug: string; title: string }>> {
  const published = await getAllPosts()
  return published.filter(p => p.frontmatter.featured).slice(0, limit).map(p => ({ slug: p.slug, title: p.frontmatter.title }))
}

/** The redirect/410 map the middleware consumes for /blog/<slug>. */
export async function getBlogRouteMap(): Promise<{
  moved: Record<string, string>
  archived: Record<string, string | null>
}> {
  const moved: Record<string, string> = {}
  const archived: Record<string, string | null> = {}
  const all = await getAllPosts({ includeDrafts: true, includeArchived: true })
  const published = new Set(all.filter(p => p.status === 'published').map(p => p.slug))
  for (const p of all) {
    for (const old of p.frontmatter.previousSlugs || []) {
      if (old && old !== p.slug) moved[old] = p.slug
    }
    if (p.status === 'archived') {
      const target = p.frontmatter.archiveRedirectSlug || null
      archived[p.slug] = target && published.has(target) ? target : null
    }
  }
  return { moved, archived }
}

/** Posts whose internal reviewBy date has passed (published or draft). */
export async function getOverdueReviews(): Promise<BlogPost[]> {
  const today = new Date().toISOString().split('T')[0]
  return (await getAllPosts({ includeDrafts: true })).filter(
    p => p.frontmatter.reviewBy && p.frontmatter.reviewBy <= today
  )
}
