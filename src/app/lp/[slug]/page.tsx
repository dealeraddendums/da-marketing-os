import { notFound } from 'next/navigation'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { MDXRemote } from 'next-mdx-remote/rsc'
import CTASection from '@/components/marketing/CTASection'

export const revalidate = 3600

interface LPFrontmatter {
  headline: string
  subheadline: string
  ctaText?: string
  ctaHref?: string
  dealerType?: string
  socialProof?: string
  features?: string[]
}

interface PageProps {
  params: { slug: string }
}

function getLP(slug: string): { frontmatter: LPFrontmatter; content: string } | null {
  const mdxPath = join(process.cwd(), 'content', 'lp', `${slug}.mdx`)
  const mdPath  = join(process.cwd(), 'content', 'lp', `${slug}.md`)
  const filePath = existsSync(mdxPath) ? mdxPath : existsSync(mdPath) ? mdPath : null
  if (!filePath) return null
  const raw = readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  return { frontmatter: data as LPFrontmatter, content }
}

export async function generateStaticParams() {
  try {
    const { readdirSync } = await import('fs')
    const files = readdirSync(join(process.cwd(), 'content', 'lp'))
    return files
      .filter(f => f.endsWith('.mdx') || f.endsWith('.md'))
      .map(f => ({ slug: f.replace(/\.(mdx|md)$/, '') }))
  } catch {
    return []
  }
}

export default async function LPPage({ params }: PageProps) {
  const lp = getLP(params.slug)
  if (!lp) notFound()

  const { frontmatter: fm, content } = lp
  const ctaHref = fm.ctaHref || '#signup'
  const ctaText = fm.ctaText || 'Start Free Trial'

  return (
    <main style={{ fontFamily: "'Roboto', sans-serif" }}>

      {/* Nav */}
      <nav style={{
        background: '#2a2b3c',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: '#ffa500',
            color: '#2a2b3c',
            fontWeight: 700,
            fontSize: 13,
            padding: '4px 10px',
            borderRadius: 4,
            letterSpacing: '0.06em',
          }}>DA</span>
          <span style={{ color: '#ffffff', fontSize: 15, fontWeight: 500 }}>DealerAddendums</span>
        </a>
        <div style={{ marginLeft: 'auto' }}>
          <a
            href={ctaHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 36,
              padding: '0 18px',
              background: '#ffa500',
              color: '#2a2b3c',
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 4,
              textDecoration: 'none',
              letterSpacing: '0.02em',
            }}
          >
            {ctaText}
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        background: '#2a2b3c',
        padding: '72px 24px 80px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {fm.dealerType && (
            <div style={{
              display: 'inline-block',
              background: 'rgba(255,165,0,0.12)',
              border: '1px solid rgba(255,165,0,0.35)',
              color: '#ffa500',
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 4,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}>
              {fm.dealerType.replace('-', ' ')} Dealers
            </div>
          )}

          <h1 style={{
            fontSize: 40,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.2,
            margin: '0 0 20px',
          }}>
            {fm.headline}
          </h1>

          <p style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.65,
            margin: '0 0 36px',
          }}>
            {fm.subheadline}
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={ctaHref}
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
              {ctaText}
            </a>
            <a
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 48,
                padding: '0 28px',
                background: 'transparent',
                color: 'rgba(255,255,255,0.8)',
                fontWeight: 500,
                fontSize: 15,
                borderRadius: 4,
                textDecoration: 'none',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              See All Features
            </a>
          </div>

          {fm.socialProof && (
            <p style={{
              marginTop: 24,
              fontSize: 13,
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.02em',
            }}>
              {fm.socialProof}
            </p>
          )}
        </div>
      </section>

      {/* Features */}
      {fm.features && fm.features.length > 0 && (
        <section style={{
          background: '#f5f6f7',
          padding: '64px 24px',
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#2a2b3c',
              margin: '0 0 36px',
              textAlign: 'center',
            }}>
              Everything You Need. Nothing You Don't.
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 20,
            }}>
              {fm.features.map((feat, i) => (
                <div
                  key={i}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e0e0e0',
                    borderRadius: 6,
                    padding: '20px 22px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <span style={{
                    background: '#ffa500',
                    color: '#2a2b3c',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: 1,
                  }}>✓</span>
                  <span style={{ fontSize: 14, color: '#333333', lineHeight: 1.5 }}>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MDX Body Content */}
      <section style={{ background: '#ffffff', padding: '64px 24px' }}>
        <div style={{
          maxWidth: 760,
          margin: '0 auto',
          fontSize: 15,
          lineHeight: 1.75,
          color: '#333333',
        }}>
          <div className="lp-prose">
            <MDXRemote source={content} />
          </div>
        </div>
      </section>

      {/* CTA / Form */}
      <CTASection />

    </main>
  )
}
