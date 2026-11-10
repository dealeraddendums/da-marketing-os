// Shared blog-post reader. Posts are MDX files in content/posts/ — there is
// no database table for them (only the revision log, migration 023). Draft /
// published / archived state and all lifecycle fields live in frontmatter:
//
//   status: "draft" | "published" | "archived"  — absent means published (legacy)
//   updatedAt: ISO date                — stamped on every save of a published post
//   archivedAt / archivedReason        — set by Archive
//   archiveRedirectSlug                — optional replacement post (old URL 301s)
//   previousSlugs: []                  — old slugs after a rename (301 sources)
//   editorNote                         — internal, NEVER rendered publicly
//   updateNotice                       — public banner at the top of the post
//   metaTitle                          — overrides title in the <title> tag
//   reviewBy: ISO date                 — internal review-due date (amber badge)
//   faq: [{ q, a }]                    — FAQPage JSON-LD + FAQ section
//   related: ["slug-a", "slug-b"]      — curated related-posts map
//   featured: true                     — homepage footer Resources row
//
// Server-side only (fs). Every consumer (blog index, [slug] page, sitemap,
// homepage footer, middleware archive map, admin routes) reads through this
// file so each status means the same thing everywhere.
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

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
  /** ISO timestamp of the last save whose body came from "Humanize with Phrasly".
   *  Provenance only — posts are MDX files (no posts table), so this lives in
   *  frontmatter like every other lifecycle field. */
  humanizedAt?: string
}

export interface BlogPost {
  slug: string
  frontmatter: BlogFrontmatter
  content: string
  readingTime: string
  status: BlogStatus
  /** Kept for existing call sites: true only for status === 'draft'. */
  draft: boolean
}

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
  const words = content.trim().split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 200))
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

export function getPost(slug: string): BlogPost | null {
  const filePath = postFilePath(slug)
  if (!filePath) return null
  const { data, content } = matter(readFileSync(filePath, 'utf-8'))
  const fm = data as BlogFrontmatter
  const status = postStatus(fm)
  return { slug, frontmatter: fm, content, readingTime: readingTime(content), status, draft: status === 'draft' }
}

/**
 * Posts, newest first. By default only PUBLISHED posts — the public index,
 * sitemap, footer and related-posts fallback must never list a draft or an
 * archived post. includeDrafts additionally admits drafts (admin queue,
 * sibling previews); includeArchived additionally admits archived posts
 * (admin queue only).
 */
export function getAllPosts(opts: { includeDrafts?: boolean; includeArchived?: boolean } = {}): BlogPost[] {
  try {
    const files = readdirSync(POSTS_DIR()).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    const posts: BlogPost[] = []
    for (const f of files) {
      const slug = f.replace(/\.(mdx|md)$/, '')
      const post = getPost(slug)
      if (!post) continue
      if (post.status === 'draft' && !opts.includeDrafts) continue
      if (post.status === 'archived' && !opts.includeArchived) continue
      posts.push(post)
    }
    return posts.sort((a, b) => {
      const da = new Date(a.frontmatter.date || 0).getTime()
      const db = new Date(b.frontmatter.date || 0).getTime()
      return db - da
    })
  } catch {
    return []
  }
}

/**
 * Related posts for a slug: the frontmatter `related` list first (in order;
 * drafts included so sibling previews link to each other pre-publish, but
 * ARCHIVED posts are always skipped), topped up with the newest published.
 */
export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const self = getPost(slug)
  const out: BlogPost[] = []
  const seen = new Set<string>([slug])
  for (const rel of self?.frontmatter.related || []) {
    if (seen.has(rel)) continue
    const p = getPost(rel)
    if (p && p.status !== 'archived') {
      out.push(p)
      seen.add(rel)
    }
    if (out.length >= limit) return out
  }
  for (const p of getAllPosts()) {
    if (out.length >= limit) break
    if (seen.has(p.slug)) continue
    out.push(p)
    seen.add(p.slug)
  }
  return out
}

/** Published posts for the homepage footer Resources row: featured only. */
export function getFooterPosts(limit = 3): Array<{ slug: string; title: string }> {
  const published = getAllPosts()
  const featured = published.filter(p => p.frontmatter.featured)
  return featured.slice(0, limit).map(p => ({ slug: p.slug, title: p.frontmatter.title }))
}

/**
 * The redirect/410 map the middleware consumes for /blog/<slug> requests:
 *  - moved:    old slug (from previousSlugs) → current slug  → 301
 *  - archived: slug → replacement slug, or null              → 301 or 410
 */
export function getBlogRouteMap(): {
  moved: Record<string, string>
  archived: Record<string, string | null>
} {
  const moved: Record<string, string> = {}
  const archived: Record<string, string | null> = {}
  for (const p of getAllPosts({ includeDrafts: true, includeArchived: true })) {
    for (const old of p.frontmatter.previousSlugs || []) {
      if (old && old !== p.slug) moved[old] = p.slug
    }
    if (p.status === 'archived') {
      const target = p.frontmatter.archiveRedirectSlug || null
      // Only redirect to a post that is actually published; otherwise 410.
      const targetPost = target ? getPost(target) : null
      archived[p.slug] = targetPost && targetPost.status === 'published' ? target : null
    }
  }
  return { moved, archived }
}

/** Posts whose internal reviewBy date has passed (published or draft). */
export function getOverdueReviews(): BlogPost[] {
  const today = new Date().toISOString().split('T')[0]
  return getAllPosts({ includeDrafts: true }).filter(
    p => p.frontmatter.reviewBy && p.frontmatter.reviewBy <= today
  )
}
