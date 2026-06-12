import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import type { Metadata } from 'next'

interface BlogFrontmatter {
  title: string
  date: string
  excerpt?: string
  author?: string
  tags?: string[]
}

interface PostMeta {
  slug: string
  frontmatter: BlogFrontmatter
  readingTime: string
}

const POSTS_DIR = join(process.cwd(), 'content', 'posts')
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'

export const metadata: Metadata = {
  title: 'Blog | DealerAddendums — Dealer Addendum & Compliance Resources',
  description:
    'Expert guides on dealer addendums, FTC Buyers Guide compliance, window stickers, and dealership best practices.',
  openGraph: {
    title: 'DealerAddendums Blog',
    description: 'Expert guides on dealer addendums, FTC compliance, and dealership best practices.',
    url: `${SITE_URL}/blog`,
    siteName: 'DealerAddendums',
    type: 'website',
  },
  alternates: { canonical: `${SITE_URL}/blog` },
}

function getAllPosts(): PostMeta[] {
  try {
    const files = readdirSync(POSTS_DIR).filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
    return files.map(f => {
      const slug = f.replace(/\.(mdx|md)$/, '')
      const raw = readFileSync(join(POSTS_DIR, f), 'utf-8')
      const { data, content } = matter(raw)
      const words = content.trim().split(/\s+/).length
      const mins = Math.max(1, Math.ceil(words / 200))
      return {
        slug,
        frontmatter: data as BlogFrontmatter,
        readingTime: `${mins} min read`,
      }
    }).sort((a, b) => {
      const da = new Date(a.frontmatter.date || 0).getTime()
      const db = new Date(b.frontmatter.date || 0).getTime()
      return db - da
    })
  } catch {
    return []
  }
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  compliance: { bg: '#fff3e0', text: '#e65100' },
  ftc:        { bg: '#fff3e0', text: '#e65100' },
  addendums:  { bg: '#e3f2fd', text: '#1565c0' },
  franchise:  { bg: '#f3e5f5', text: '#6a1b9a' },
  efficiency: { bg: '#e8f5e9', text: '#2e7d32' },
  operations: { bg: '#e8f5e9', text: '#2e7d32' },
  'best practices': { bg: '#fce4ec', text: '#880e4f' },
  'f&i':      { bg: '#e8eaf6', text: '#283593' },
  education:  { bg: '#e0f7fa', text: '#006064' },
  checklist:  { bg: '#fff3e0', text: '#e65100' },
  'buyers guide': { bg: '#fce4ec', text: '#880e4f' },
}

function tagStyle(tag: string) {
  const key = tag.toLowerCase()
  return TAG_COLORS[key] || { bg: '#f5f6f7', text: '#55595c' }
}

export default function BlogIndex() {
  const posts = getAllPosts()
  const [featured, ...rest] = posts

  return (
    <main style={{ fontFamily: "'Roboto', sans-serif", background: '#ffffff', minHeight: '100vh' }}>
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
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-light.svg" alt="DealerAddendums" width={195} height={22} style={{ display: 'block' }} />
        </a>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/blog" style={{ fontSize: 14, color: '#ffffff', textDecoration: 'none', fontWeight: 500 }}>
            Blog
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

      {/* Header */}
      <div style={{
        background: '#f5f6f7',
        borderBottom: '1px solid #e0e0e0',
        padding: '48px 24px 40px',
        textAlign: 'center',
      }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#2a2b3c', margin: '0 0 12px' }}>
          Dealership Resources
        </h1>
        <p style={{ fontSize: 16, color: '#55595c', margin: 0, maxWidth: 560, marginInline: 'auto' }}>
          Practical guides on addendum compliance, FTC requirements, and running a tighter operation.
        </p>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>

        {/* Featured post */}
        {featured && (
          <a
            href={`/blog/${featured.slug}`}
            style={{ display: 'block', textDecoration: 'none', marginBottom: 48 }}
          >
            <div style={{
              border: '1px solid #e0e0e0',
              borderRadius: 6,
              padding: '36px 40px',
              background: '#ffffff',
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 32,
              alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {featured.frontmatter.tags?.map(tag => {
                    const { bg, text } = tagStyle(tag)
                    return (
                      <span key={tag} style={{
                        background: bg,
                        color: text,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: 20,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.06em',
                      }}>
                        {tag}
                      </span>
                    )
                  })}
                  <span style={{
                    background: '#2a2b3c',
                    color: '#ffa500',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 10px',
                    borderRadius: 20,
                    letterSpacing: '0.06em',
                  }}>
                    LATEST
                  </span>
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#2a2b3c', margin: '0 0 12px', lineHeight: 1.3 }}>
                  {featured.frontmatter.title}
                </h2>
                {featured.frontmatter.excerpt && (
                  <p style={{ fontSize: 15, color: '#55595c', margin: '0 0 16px', lineHeight: 1.6 }}>
                    {featured.frontmatter.excerpt}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  {featured.frontmatter.date && (
                    <span style={{ fontSize: 13, color: '#78828c' }}>
                      {new Date(featured.frontmatter.date).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#78828c' }}>{featured.readingTime}</span>
                </div>
              </div>
              <div style={{
                background: '#2a2b3c',
                color: '#ffa500',
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
              }}>
                →
              </div>
            </div>
          </a>
        )}

        {/* Post grid */}
        {rest.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2a2b3c', margin: '0 0 24px' }}>
              All Articles
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}>
              {rest.map(post => (
                <a
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  style={{
                    border: '1px solid #e0e0e0',
                    borderRadius: 6,
                    padding: '24px',
                    background: '#ffffff',
                    textDecoration: 'none',
                    display: 'flex',
                    flexDirection: 'column' as const,
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {post.frontmatter.tags?.slice(0, 2).map(tag => {
                      const { bg, text } = tagStyle(tag)
                      return (
                        <span key={tag} style={{
                          background: bg,
                          color: text,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.06em',
                        }}>
                          {tag}
                        </span>
                      )
                    })}
                  </div>
                  <h3 style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#2a2b3c',
                    margin: 0,
                    lineHeight: 1.4,
                    flex: 1,
                  }}>
                    {post.frontmatter.title}
                  </h3>
                  {post.frontmatter.excerpt && (
                    <p style={{
                      fontSize: 13,
                      color: '#55595c',
                      margin: 0,
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    } as React.CSSProperties}>
                      {post.frontmatter.excerpt}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                    {post.frontmatter.date && (
                      <span style={{ fontSize: 12, color: '#78828c' }}>
                        {new Date(post.frontmatter.date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#78828c' }}>{post.readingTime}</span>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {posts.length === 0 && (
          <p style={{ color: '#78828c', textAlign: 'center', padding: '64px 0' }}>
            No posts yet.
          </p>
        )}
      </div>

      {/* CTA strip */}
      <div style={{ background: '#2a2b3c', padding: '48px 24px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: '0 0 12px' }}>
          Ready to streamline your dealership's paperwork?
        </h3>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: '0 0 24px' }}>
          Join 1,600+ dealerships using DealerAddendums. Month-to-month. No credit card required.
        </p>
        <a href="/#signup" style={{
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
        }}>
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
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Support', href: 'mailto:support@dealeraddendums.com' },
          ].map(link => (
            <a key={link.label} href={link.href} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
