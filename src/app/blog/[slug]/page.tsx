import { notFound } from 'next/navigation'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { MDXRemote } from 'next-mdx-remote/rsc'
import type { Metadata } from 'next'

interface BlogFrontmatter {
  title: string
  date: string
  excerpt?: string
  metaDescription?: string
  author?: string
  tags?: string[]
  coverImage?: string
}

interface PostMeta {
  slug: string
  frontmatter: BlogFrontmatter
}

interface PageProps {
  params: { slug: string }
}

export const revalidate = 3600

const POSTS_DIR = () => join(process.cwd(), 'content', 'posts')
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'

function getPost(slug: string): { frontmatter: BlogFrontmatter; content: string } | null {
  const mdxPath = join(POSTS_DIR(), `${slug}.mdx`)
  const mdPath  = join(POSTS_DIR(), `${slug}.md`)
  const filePath = existsSync(mdxPath) ? mdxPath : existsSync(mdPath) ? mdPath : null
  if (!filePath) return null
  const { data, content } = matter(readFileSync(filePath, 'utf-8'))
  return { frontmatter: data as BlogFrontmatter, content }
}

function getAllPosts(): PostMeta[] {
  try {
    const files = readdirSync(POSTS_DIR()).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    return files.map(f => {
      const slug = f.replace(/\.(mdx|md)$/, '')
      const { data } = matter(readFileSync(join(POSTS_DIR(), f), 'utf-8'))
      return { slug, frontmatter: data as BlogFrontmatter }
    }).sort((a, b) => {
      const da = new Date(a.frontmatter.date || 0).getTime()
      const db = new Date(b.frontmatter.date || 0).getTime()
      return db - da
    })
  } catch {
    return []
  }
}

function readingTime(content: string): string {
  const words = content.trim().split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 200))
  return `${mins} min read`
}

export async function generateStaticParams() {
  try {
    return readdirSync(POSTS_DIR())
      .filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
      .map(f => ({ slug: f.replace(/\.(mdx|md)$/, '') }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = getPost(params.slug)
  if (!post) return {}
  const { frontmatter: fm } = post
  const description = fm.metaDescription || fm.excerpt || ''
  const url = `${SITE_URL}/blog/${params.slug}`
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(fm.title)}&type=blog`

  return {
    title: `${fm.title} | DealerAddendums Blog`,
    description,
    openGraph: {
      title: fm.title,
      description,
      url,
      siteName: 'DealerAddendums',
      type: 'article',
      publishedTime: fm.date,
      authors: fm.author ? [fm.author] : ['DealerAddendums'],
      tags: fm.tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: fm.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fm.title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: url },
  }
}

export default async function BlogPost({ params }: PageProps) {
  const post = getPost(params.slug)
  if (!post) notFound()

  const { frontmatter: fm, content } = post
  const readTime = readingTime(content)
  const allPosts = getAllPosts()
  const related = allPosts.filter(p => p.slug !== params.slug).slice(0, 3)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: fm.title,
    description: fm.metaDescription || fm.excerpt || '',
    datePublished: fm.date,
    dateModified: fm.date,
    author: { '@type': 'Person', name: fm.author || 'DealerAddendums' },
    publisher: {
      '@type': 'Organization',
      name: 'DealerAddendums',
      url: SITE_URL,
    },
    url: `${SITE_URL}/blog/${params.slug}`,
    image: fm.coverImage || `${SITE_URL}/og-default.png`,
    keywords: fm.tags?.join(', '),
  }

  return (
    <main style={{ fontFamily: "'Roboto', sans-serif", background: '#ffffff' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Nav */}
      <nav style={{
        background: '#2a2b3c',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: '#ffa500',
            color: '#2a2b3c',
            fontWeight: 700,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            letterSpacing: '0.08em',
          }}>DA</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>DealerAddendums</span>
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/blog" style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
            ← Blog
          </a>
          <a href="/#signup" style={{
            background: '#1976d2',
            color: '#ffffff',
            padding: '0 14px',
            height: 32,
            lineHeight: '32px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 4,
            textDecoration: 'none',
            display: 'inline-block',
            marginLeft: 8,
          }}>
            Free Trial
          </a>
        </div>
      </nav>

      {/* Post header */}
      <div style={{
        background: '#f5f6f7',
        borderBottom: '1px solid #e0e0e0',
        padding: '48px 24px 40px',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {fm.tags && fm.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {fm.tags.map(tag => (
                <span key={tag} style={{
                  background: '#e3f2fd',
                  color: '#1565c0',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: 20,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            color: '#2a2b3c',
            lineHeight: 1.25,
            margin: '0 0 16px',
          }}>
            {fm.title}
          </h1>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {fm.author && (
              <span style={{ fontSize: 13, color: '#55595c', fontWeight: 500 }}>
                By {fm.author}
              </span>
            )}
            {fm.date && (
              <span style={{ fontSize: 13, color: '#78828c' }}>
                {new Date(fm.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              background: '#f5f6f7',
              border: '1px solid #e0e0e0',
              color: '#78828c',
              padding: '2px 10px',
              borderRadius: 20,
              letterSpacing: '0.04em',
            }}>
              {readTime}
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <article style={{ padding: '48px 24px 64px' }}>
        <div style={{
          maxWidth: 760,
          margin: '0 auto',
          fontSize: 15,
          lineHeight: 1.8,
          color: '#333333',
        }}>
          <MDXRemote source={content} />
        </div>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section style={{
          background: '#f5f6f7',
          borderTop: '1px solid #e0e0e0',
          padding: '48px 24px',
        }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#2a2b3c',
              margin: '0 0 24px',
            }}>
              More for Dealers
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {related.map(p => (
                <a
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e0e0e0',
                    borderRadius: 6,
                    padding: 18,
                    textDecoration: 'none',
                    display: 'block',
                  }}
                >
                  {p.frontmatter.tags?.[0] && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#1565c0',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      display: 'block',
                      marginBottom: 6,
                    }}>
                      {p.frontmatter.tags[0]}
                    </span>
                  )}
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#2a2b3c',
                    lineHeight: 1.4,
                    marginBottom: 8,
                  }}>
                    {p.frontmatter.title}
                  </div>
                  {p.frontmatter.date && (
                    <div style={{ fontSize: 12, color: '#78828c' }}>
                      {new Date(p.frontmatter.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA strip */}
      <div id="signup" style={{
        background: '#2a2b3c',
        padding: '48px 24px',
        textAlign: 'center',
      }}>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: '0 0 12px' }}>
          Ready to streamline your dealership's paperwork?
        </h3>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: '0 0 24px' }}>
          Join 1,644 dealerships using DealerAddendums. Month-to-month. No credit card required.
        </p>
        <a
          href="/#signup"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 48,
            padding: '0 32px',
            background: '#ffa500',
            color: '#2a2b3c',
            fontWeight: 700,
            fontSize: 16,
            borderRadius: 4,
            textDecoration: 'none',
          }}
        >
          Start Free Trial
        </a>
      </div>

      {/* Footer */}
      <div style={{
        background: '#2a2b3c',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          © 2025 DealerAddendums. All rights reserved.
        </span>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Privacy Policy', 'Terms of Service', 'Support'].map(link => (
            <a key={link} href="#" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
              {link}
            </a>
          ))}
        </div>
      </div>

    </main>
  )
}
