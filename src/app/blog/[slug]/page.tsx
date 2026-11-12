import { notFound, permanentRedirect } from 'next/navigation'
import { MDXRemote } from 'next-mdx-remote/rsc'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import LoginMenu from '@/components/marketing/LoginMenu'
import PostBoilerplate from '@/components/blog/PostBoilerplate'
import { getPost, getAllPosts, getRelatedPosts, getBlogRouteMap } from '@/lib/blog'
import { deriveFaqFromBody } from '@/lib/blog-faq'

interface PageProps {
  params: { slug: string }
}

// Internal editor notes like "[ALLAN: confirm X]" must never reach a reader.
const ALLAN_NOTE = /\[ALLAN:[^\]]*\]/g

// Slug an H2's text into a stable anchor id (matches the table-of-contents
// links built from the same headings).
function slugifyHeading(s: string): string {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

// Plain text out of rendered MDX children, so a custom <h2> can derive its id.
function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in (node as any)) return textOf((node as any).props?.children)
  return ''
}

// Give every H2 an anchor id so the "In this article" TOC can link to it.
// scroll-mt (set via prose) keeps the sticky top nav from covering the target.
const mdxComponents = {
  h2: (props: { children?: ReactNode }) => (
    <h2 id={slugifyHeading(textOf(props.children))}>{props.children}</h2>
  ),
}

export const revalidate = 3600

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

// Only published posts are pre-rendered; drafts still resolve at request time
// (dynamicParams defaults to true) so they have preview URLs, with noindex.
export async function generateStaticParams() {
  return (await getAllPosts()).map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await getPost(params.slug)
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
  const post = await getPost(params.slug)

  // Fallbacks for renamed / archived posts. The middleware normally answers
  // these with a true 301 / 410 before the page runs; this covers a cold
  // archive-map cache or a direct render.
  if (!post) {
    const { moved } = await getBlogRouteMap()
    if (moved[params.slug]) permanentRedirect(`/blog/${moved[params.slug]}`)
    notFound()
  }
  if (post.status === 'archived') {
    const target = post.frontmatter.archiveRedirectSlug
    const targetPost = target ? await getPost(target) : null
    if (targetPost && targetPost.status === 'published') permanentRedirect(`/blog/${target}`)
    notFound()
  }

  const { frontmatter: fm, content, readingTime: readTime } = post
  const related = await getRelatedPosts(params.slug, 3)

  // Never render internal "[ALLAN: …]" notes publicly (defense in depth — the
  // publish guard also blocks publishing a post that still has them).
  const cleaned = content.replace(ALLAN_NOTE, '').replace(/[ \t]{2,}/g, ' ')

  // The generator ends full posts with a "## Ready to …" CTA section. Pull it
  // out of the body and render it as the CTA card instead, so it isn't a plain
  // trailing heading. If there's no such section, the card uses fm.cta / a
  // default — the card always shows.
  const ctaHeadingRe = /\n##\s+Ready to[^\n]*\n/i
  const ctaMatch = cleaned.match(ctaHeadingRe)
  const bodyForRender = ctaMatch ? cleaned.slice(0, ctaMatch.index).trimEnd() : cleaned.trimEnd()

  // Table of contents from the H2s that remain in the rendered body.
  const toc = Array.from(bodyForRender.matchAll(/^##\s+(.+?)\s*$/gm)).map(m => ({
    text: m[1].trim(),
    id: slugifyHeading(m[1]),
  }))

  const ctaText =
    fm.cta?.trim() ||
    'Month-to-month, no setup fees. Join 2,100+ dealerships using DealerAddendums.'
  const ctaHref = `/?utm_source=blog&utm_medium=cta&utm_campaign=${encodeURIComponent(params.slug)}#signup`

  // FAQPage: the explicit frontmatter faq wins; otherwise derive from the
  // post's own structure (≥2 question-phrased H2/H3 headings with answers) —
  // never forced onto a post without a real Q&A section.
  const faqItems = (fm.faq && fm.faq.length > 0) ? fm.faq : deriveFaqFromBody(bodyForRender)
  const faqJsonLd = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
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
    // The byline is the company, not a person — matches the visible author
    // treatment and the Organization emitted on the homepage.
    author: { '@type': 'Organization', name: 'DealerAddendums', url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Organization',
      name: 'DealerAddendums',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/images/da-mark.png`,
        width: 214,
        height: 214,
      },
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
      <article style={{ padding: '48px 24px 64px', background: '#ffffff' }}>
        <div className="mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-start">
          {/* In-this-article TOC — desktop only, sticky */}
          {toc.length >= 2 && (
            <nav aria-label="In this article" className="hidden shrink-0 lg:block lg:w-56 lg:sticky lg:top-[72px]">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#78828c]">In this article</div>
              <ul className="space-y-2 border-l border-[#e0e0e0] pl-4 text-sm">
                {toc.map(h => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="block leading-snug text-[#55595c] no-underline hover:text-[#1976d2]">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="mx-auto w-full min-w-0 max-w-3xl lg:mx-0">
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

            <div className="prose prose-lg max-w-none prose-headings:text-[#2a2b3c] prose-a:text-[#1976d2] prose-a:font-medium prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-2xl prose-h2:font-semibold prose-h2:scroll-mt-24 prose-h3:mt-8 prose-h3:text-xl prose-p:leading-relaxed prose-p:my-5 prose-li:my-1 prose-ul:list-disc prose-ol:list-decimal prose-ul:pl-6 prose-ol:pl-6 prose-strong:text-[#2a2b3c] prose-blockquote:border-l-4 prose-blockquote:border-[#90caf9] prose-blockquote:bg-[#f5f9ff] prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:not-italic prose-blockquote:text-[#334] prose-code:rounded prose-code:bg-[#f0f2f5] prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.9em] prose-code:font-normal prose-code:before:content-[''] prose-code:after:content-['']">
              <MDXRemote source={bodyForRender} components={mdxComponents} />
            </div>

            <PostBoilerplate />

            {/* Closing CTA card */}
            <aside style={{
              marginTop: 32,
              borderRadius: 8,
              background: '#f5f9ff',
              border: '1px solid #bbdefb',
              padding: '28px 32px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2a2b3c', marginBottom: 8 }}>
                Ready to try it on your own inventory?
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#404347', margin: '0 auto 18px', maxWidth: 560 }}>
                {ctaText}
              </p>
              <a href={ctaHref} style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 44,
                padding: '0 28px',
                background: '#1976d2',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 15,
                borderRadius: 4,
                textDecoration: 'none',
              }}>
                Start your free trial
              </a>
            </aside>
          </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 16 }}>
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
