import { MetadataRoute } from 'next'
import { readdirSync } from 'fs'
import { join } from 'path'
import { getAllPosts } from '@/lib/blog'

// Canonical tags use NEXT_PUBLIC_SITE_URL (www on prod) — the sitemap must
// list the same host or the two signals contradict each other.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// ISR so posts published after the build appear without a redeploy;
// /api/blog-publish revalidates this path explicitly on publish.
export const revalidate = 3600

function getPostDates(): Record<string, string> {
  const dates: Record<string, string> = {}
  // Drafts and archived posts are excluded — getAllPosts() returns published
  // only. lastmod = updatedAt (stamped on every published save) when present.
  for (const p of getAllPosts()) {
    dates[p.slug] = p.frontmatter.updatedAt || p.frontmatter.date || new Date().toISOString()
  }
  return dates
}

function getLPSlugs(): string[] {
  try {
    const dir = join(process.cwd(), 'content', 'lp')
    return readdirSync(dir)
      .filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
      .map(f => f.replace(/\.(mdx|md)$/, ''))
  } catch { return [] }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const postDates = getPostDates()
  const lpSlugs = getLPSlugs()

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
  ]

  const blogPages: MetadataRoute.Sitemap = Object.entries(postDates).map(([slug, date]) => ({
    url: `${SITE_URL}/blog/${slug}`,
    lastModified: new Date(date),
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  const lpPages: MetadataRoute.Sitemap = lpSlugs.map(slug => ({
    url: `${SITE_URL}/lp/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [...staticPages, ...blogPages, ...lpPages]
}
