import { MetadataRoute } from 'next'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

const SITE_URL = 'https://dealeraddendums.com'

function getPostDates(): Record<string, string> {
  const dates: Record<string, string> = {}
  try {
    const dir = join(process.cwd(), 'content', 'posts')
    const files = readdirSync(dir).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    for (const f of files) {
      const slug = f.replace(/\.(mdx|md)$/, '')
      const { data } = matter(readFileSync(join(dir, f), 'utf-8'))
      dates[slug] = data.date || new Date().toISOString()
    }
  } catch { /* no posts */ }
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
