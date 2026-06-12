'use client'
import { useEffect, useRef } from 'react'
import posthog from 'posthog-js'
import type { HeroContent, HeroTracking } from '@/lib/hero-engine'
import LoginMenu from './LoginMenu'

// Signals the client echoes back to /api/personalize to warm the hero cache
// for this context (server recomputes the context key — never trusts ours).
export interface WarmPayload {
  keyword: string
  utmCampaign: string
  returning: boolean
}

interface Props {
  hero: HeroContent
  tracking: HeroTracking
  warm: WarmPayload | null
}

const NAV_LINKS = ['Features', 'Pricing', 'Testimonials']

export function trackingProps(t: HeroTracking) {
  return {
    context_key: t.contextKey,
    variation_id: t.variationId,
    hero_source: t.heroSource,
    keyword: t.keyword,
    dealer_type: t.dealerType,
    ab_variant: t.abVariant,
    layout_variant: t.layoutVariant,
  }
}

export function capture(event: string, t: HeroTracking, extra: Record<string, unknown> = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
  try {
    posthog.capture(event, { ...trackingProps(t), ...extra })
  } catch {
    // analytics must never break the page
  }
}

export default function HeroSection({ hero, tracking, warm }: Props) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    capture('hero_view', tracking, { headline: hero.headline })

    // Legacy A/B dashboard feed (Supabase ab_events)
    fetch('/api/ab-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'hero_impression',
        abVariant: tracking.abVariant,
        layoutVariant: tracking.layoutVariant,
        utmTerm: tracking.keyword,
        headline: hero.headline,
        aiGenerated: tracking.heroSource === 'cache',
        contextKey: tracking.contextKey,
        variationId: tracking.variationId,
      }),
    }).catch(() => {})

    // Cold context: warm the cache for the NEXT visitor — after paint,
    // fire-and-forget, never blocks anything visible.
    if (warm) {
      fetch('/api/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(warm),
        keepalive: true,
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const proofSuffix = /credit card|cancel/i.test(hero.proofLine)
    ? ''
    : ' · No credit card required · Cancel anytime'

  return (
    <section style={{ fontFamily: "'Roboto', sans-serif" }}>

      {/* ── Navigation ──────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-light.svg"
            alt="DealerAddendums"
            width={195}
            height={22}
            style={{ display: 'block' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {NAV_LINKS.map(label => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              style={{
                padding: '6px 14px',
                fontSize: 14,
                color: 'rgba(255,255,255,0.8)',
                borderRadius: 4,
                cursor: 'pointer',
                textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            >
              {label}
            </a>
          ))}
          <span style={{ marginRight: 8 }}>
            <LoginMenu variant="dark" />
          </span>
          <a
            href="#signup"
            style={{
              background: '#1976d2',
              color: '#ffffff',
              padding: '0 16px',
              height: 32,
              lineHeight: '32px',
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 4,
              cursor: 'pointer',
              display: 'inline-block',
              textDecoration: 'none',
            }}
          >
            Free Trial
          </a>
        </div>
      </nav>

      {/* ── Hero Content ─────────────────────────────────────── */}
      <div style={{
        background: '#2a2b3c',
        padding: '80px 24px 72px',
        minHeight: 480,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ maxWidth: 1100, width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: 64, alignItems: 'center' }}>

          {/* Left: copy */}
          <div style={{ maxWidth: 600 }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(255,165,0,0.15)',
              border: '1px solid rgba(255,165,0,0.4)',
              borderRadius: 4,
              padding: '4px 14px',
              fontSize: 11,
              fontWeight: 700,
              color: '#ffa500',
              marginBottom: 20,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
            }}>
              {(tracking.heroSource === 'cache' || tracking.heroSource === 'static-term') && tracking.keyword
                ? `Personalized for ${tracking.keyword}`
                : '1,600+ Dealerships · $800M+ in Addendums'}
            </div>

            <h1
              data-ab-variant={tracking.abVariant}
              data-hero-source={tracking.heroSource}
              data-variation-id={tracking.variationId}
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
              color: 'rgba(255,255,255,0.8)',
              lineHeight: 1.65,
              margin: '0 0 32px',
            }}>
              {hero.subheadline}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
              <a
                href="#signup"
                data-track="hero-cta"
                onClick={() => capture('cta_click', tracking, { cta_text: hero.ctaText })}
                style={{
                  background: '#ffa500',
                  color: '#2a2b3c',
                  height: 48,
                  lineHeight: '48px',
                  padding: '0 32px',
                  fontSize: 16,
                  fontWeight: 700,
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'inline-block',
                  whiteSpace: 'nowrap' as const,
                  textDecoration: 'none',
                }}
              >
                {hero.ctaText}
              </a>
              <a
                href="https://app.dealeraddendums.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.3)',
                  paddingBottom: 1,
                }}
              >
                Log into your account →
              </a>
            </div>

            {hero.featuredBenefits?.length > 0 && (
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' as const, marginTop: 22 }}>
                {hero.featuredBenefits.map(benefit => (
                  <span key={benefit} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.7)',
                  }}>
                    <span style={{ color: '#4caf50', fontWeight: 700 }}>✓</span>
                    {benefit}
                  </span>
                ))}
              </div>
            )}

            <p style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.4)',
              margin: '14px 0 0',
            }}>
              {hero.proofLine}{proofSuffix}
            </p>
          </div>

          {/* Right: live stats */}
          <div style={{ display: 'grid', gap: 12, width: 210 }}>
            {[
              { value: '1,600+', label: 'Active Dealerships' },
              { value: '3.6M+', label: 'Addendums Printed' },
              { value: '$800M+', label: 'Addendum Value' },
              { value: '2014', label: 'Serving Dealers Since' },
            ].map(stat => (
              <div
                key={stat.label}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6,
                  padding: '14px 18px',
                  textAlign: 'center',
                }}
              >
                <div style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1,
                  marginBottom: 4,
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.55)',
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Trust bar ─────────────────────────────────────────── */}
      <div style={{
        background: '#f5f6f7',
        borderBottom: '1px solid #e0e0e0',
        padding: '12px 24px',
        textAlign: 'center',
      }}>
        <p style={{
          fontSize: 13,
          color: '#55595c',
          margin: 0,
          letterSpacing: '0.02em',
        }}>
          <span style={{ fontWeight: 500 }}>Month-to-month</span> &nbsp;·&nbsp;
          <span style={{ fontWeight: 500 }}>No setup fees</span> &nbsp;·&nbsp;
          <span style={{ fontWeight: 500 }}>Up and running in minutes</span> &nbsp;·&nbsp;
          <span style={{ fontWeight: 500 }}>US-based support</span> &nbsp;·&nbsp;
          <span style={{ fontWeight: 500 }}>In business since 2014</span>
        </p>
      </div>

    </section>
  )
}
