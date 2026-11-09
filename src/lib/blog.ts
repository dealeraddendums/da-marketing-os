// Shared blog-post reader. Posts are MDX files in content/posts/ — there is
// no database table for them. Draft state, FAQ schema, related posts and the
// footer "featured" flag all live in frontmatter:
//
//   status: "draft" | "published"   — absent means published (legacy posts)
//   faq: [{ q, a }]                 — rendered as FAQPage JSON-LD + an FAQ section
//   related: ["slug-a", "slug-b"]   — curated related-posts map (fallback: newest)
//   featured: true                  — eligible for the homepage footer Resources row
//
// Server-side only (fs). Every consumer (blog index, [slug] page, sitemap,
// homepage footer, admin blog-list/publish routes) reads through this file so
// "draft" means the same thing everywhere.
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

export interface BlogFaqItem {
  q: string
  a: string
}

export interface BlogFrontmatter {
  title: string
  date: string
  excerpt?: string
  metaDescription?: string
  author?: string
  tags?: string[]
  coverImage?: string
  status?: 'draft' | 'published'
  faq?: BlogFaqItem[]
  related?: string[]
  featured?: boolean
}

export interface BlogPost {
  slug: string
  frontmatter: BlogFrontmatter
  content: string
  readingTime: string
  draft: boolean
}

export const POSTS_DIR = () => join(process.cwd(), 'content', 'posts')

export function isDraft(fm: BlogFrontmatter): boolean {
  return fm.status === 'draft'
}

function readingTime(content: string): string {
  const words = content.trim().split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 200))
  return `${mins} min read`
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
  return { slug, frontmatter: fm, content, readingTime: readingTime(content), draft: isDraft(fm) }
}

/**
 * All posts, newest first. Drafts are excluded unless includeDrafts is true —
 * the public index, sitemap and footer must never list a draft; the admin
 * Blog Queue and the [slug] preview page pass includeDrafts.
 */
export function getAllPosts(opts: { includeDrafts?: boolean } = {}): BlogPost[] {
  try {
    const files = readdirSync(POSTS_DIR()).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    const posts: BlogPost[] = []
    for (const f of files) {
      const slug = f.replace(/\.(mdx|md)$/, '')
      const post = getPost(slug)
      if (!post) continue
      if (post.draft && !opts.includeDrafts) continue
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
 * Related posts for a slug: the frontmatter `related` list first (in order,
 * drafts included so sibling previews link to each other pre-publish), topped
 * up with the newest published posts.
 */
export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const self = getPost(slug)
  const out: BlogPost[] = []
  const seen = new Set<string>([slug])
  for (const rel of self?.frontmatter.related || []) {
    if (seen.has(rel)) continue
    const p = getPost(rel)
    if (p) {
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

/** Published posts for the homepage footer Resources row: featured first, newest first. */
export function getFooterPosts(limit = 3): Array<{ slug: string; title: string }> {
  const published = getAllPosts()
  const featured = published.filter(p => p.frontmatter.featured)
  const pool = featured.length > 0 ? featured : []
  return pool.slice(0, limit).map(p => ({ slug: p.slug, title: p.frontmatter.title }))
}
