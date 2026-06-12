import { notFound } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import { MDXRemote } from 'next-mdx-remote/rsc'
import CTASection from '@/components/marketing/CTASection'
import HeroTelemetry from '@/components/marketing/HeroTelemetry'
import { CTX_HEADERS, buildSignals, type Device } from '@/lib/context-key'
import { resolveHero, type HeroContent, type HeroTracking } from '@/lib/hero-engine'
import type { WarmPayload } from '@/components/marketing/HeroSection'

// Dynamic Landing Engine: heroes vary per visitor context, so these pages
// render per-request (was ISR). The mdx body itself is still the static base
// and the guaranteed fallback.
export const dynamic = 'force-dynamic'

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

export default async function LPPage({ params }: PageProps) {
  const lp = getLP(params.slug)
  if (!lp) notFound()

  const { frontmatter: fm, content } = lp
  const ctaHref = fm.ctaHref || '#signup'

  const h = headers()
  const cookieStore = cookies()
  const abVariant     = cookieStore.get('da_hero_ab')?.value || 'personalized'
  const layoutVariant = cookieStore.get('da_layout')?.value  || 'b'

  const derived = buildSignals({
    keyword: h.get(CTX_HEADERS.keyword) || '',
    utmCampaign: h.get(CTX_HEADERS.campaign) || '',
    userAgent: h.get('user-agent') || '',
    returning: h.get(CTX_HEADERS.returning) === '1',
  })
  const signals = {
    ...derived,
    keywordCluster: h.get(CTX_HEADERS.cluster) ?? derived.keywordCluster,
    dealerType: h.get(CTX_HEADERS.dealerType) ?? derived.dealerType,
    device: (h.get(CTX_HEADERS.device) as Device) ?? derived.device,
    contextKey: h.get(CTX_HEADERS.contextKey) ?? derived.contextKey,
  }

  // The page's curated frontmatter is this LP's static hero (and fallback).
  const fmHero: HeroContent = {
    headline: fm.headline,
    subheadline: fm.subheadline,
    ctaText: fm.ctaText || 'Start Free Trial',
    proofLine: fm.socialProof || 'Trusted by 1,600+ dealerships since 2014',
    featuredBenefits: [],
  }

  const resolved = await resolveHero(signals, abVariant, {
    hero: fmHero,
    variationId: `lp:${params.slug}`,
  })

  const tracking: HeroTracking = {
    contextKey: signals.contextKey,
    variationId: resolved.variationId,
    heroSource: resolved.source,
    keyword: signals.keyword,
    dealerType: signals.dealerType,
    abVariant,
    layoutVariant,
    headline: resolved.hero.headline,
  }

  const warm: WarmPayload | null = resolved.needsWarm
    ? { keyword: signals.keyword, utmCampaign: signals.utmCampaign, returning: signals.returning }
    : null

  const hero = resolved.hero

  return (
    <main style={{ fontFamily: "'Roboto', sans-serif" }}>
      <HeroTelemetry tracking={tracking} warm={warm} />

      {/* Nav */}
      <nav style={{
        background: '#2a2b3c',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
      }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-light.svg"
            alt="DealerAddendums"
            width={195}
            height={22}
            style={{ display: 'block' }}
          />
        </a>
        <div style={{ marginLeft: 'auto' }}>
          <a
            href={ctaHref}
            data-track="hero-cta"
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
            {hero.ctaText}
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

          <h1
            data-hero-source={resolved.source}
            data-variation-id={resolved.variationId}
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              margin: '0 0 20px',
            }}
          >
            {hero.headline}
          </h1>

          <p style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.65,
            margin: '0 0 36px',
          }}>
            {hero.subheadline}
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={ctaHref}
              data-track="hero-cta"
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
              {hero.ctaText}
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

          <p style={{
            marginTop: 24,
            fontSize: 13,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.02em',
          }}>
            {hero.proofLine}
          </p>
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
      <CTASection tracking={tracking} />

    </main>
  )
}
