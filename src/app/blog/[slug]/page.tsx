import { notFound, permanentRedirect } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import type { Metadata } from 'next'
import LoginMenu from '@/components/marketing/LoginMenu'
import PostBoilerplate from '@/components/blog/PostBoilerplate'
import { getPost, getAllPosts, getRelatedPosts, getBlogRouteMap } from '@/lib/blog'

interface PageProps {
  params: { slug: string }
}

export const revalidate = 3600

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Only published posts are pre-rendered; drafts still resolve at request time
// (dynamicParams defaults to true) so they have preview URLs, with noindex.
export async function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = getPost(params.slug)
  if (!post || post.status === 'archived') return {}
  const { frontmatter: fm } = post
  const description = fm.metaDescription || fm.excerpt || ''
  const url = `${SITE_URL}/blog/${params.slug}`
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(fm.title)}&type=blog`

  return {
    title: `${fm.metaTitle || fm.title} | DealerAddendums Blog`,
    description,
    ...(post.draft ? { robots: { index: false, follow: false } } : {}),
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

  // Fallbacks for renamed / archived posts. The middleware normally answers
  // these with a true 301 / 410 before the page runs; this covers a cold
  // archive-map cache or a direct render.
  if (!post) {
    const { moved } = getBlogRouteMap()
    if (moved[params.slug]) permanentRedirect(`/blog/${moved[params.slug]}`)
    notFound()
  }
  if (post.status === 'archived') {
    const target = post.frontmatter.archiveRedirectSlug
    const targetPost = target ? getPost(target) : null
    if (targetPost && targetPost.status === 'published') permanentRedirect(`/blog/${target}`)
    notFound()
  }

  const { frontmatter: fm, content, readingTime: readTime } = post
  const related = getRelatedPosts(params.slug, 3)

  const faqJsonLd = fm.faq && fm.faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: fm.faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  } : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: fm.title,
    description: fm.metaDescription || fm.excerpt || '',
    datePublished: fm.date,
    dateModified: fm.updatedAt || fm.date,
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
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      {post.draft && (
        <div style={{
          background: '#fff3e0',
          borderBottom: '1px solid #ffb74d',
          color: '#e65100',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          padding: '8px 16px',
        }}>
          DRAFT — this post is not published. It is excluded from the blog index, sitemap, and search engines.
        </div>
      )}

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
          <a href="/blog" style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
            ← Blog
          </a>
          <LoginMenu variant="dark" />
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
            {fm.updatedAt && fm.updatedAt !== fm.date && (
              <span style={{ fontSize: 13, color: '#78828c' }}>
                · Updated {new Date(fm.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
          {fm.updateNotice && (
            <div style={{
              background: '#e3f2fd',
              border: '1px solid #90caf9',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 28,
              fontSize: 14,
              lineHeight: 1.6,
              color: '#0d47a1',
            }}>
              <strong style={{ fontWeight: 700 }}>Update: </strong>{fm.updateNotice}
            </div>
          )}
          <MDXRemote source={content} />
          <PostBoilerplate />
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
          Join 2,100+ dealerships using DealerAddendums. Month-to-month. No credit card required.
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
