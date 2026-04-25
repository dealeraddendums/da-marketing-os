'use client'
import { useEffect, useState } from 'react'
import type { PersonalizationContext } from '@/lib/personalization'

interface Props {
  personalization: PersonalizationContext
}

const DEFAULTS = {
  headline: 'The #1 Addendum Platform for Car Dealers',
  subheadline: 'Easily print customized vehicle addendums, buyers guides, and info sheets from your computer, tablet or iOS app. 1,600+ dealerships trust DealerAddendums.',
  cta: 'Start Free Trial',
  socialProof: 'Trusted by 1,644 dealerships since 2014',
}

const NAV_LINKS = ['Features', 'Pricing', 'Testimonials']

export default function HeroSection({ personalization }: Props) {
  const [content, setContent] = useState({
    headline:    personalization.headline    || DEFAULTS.headline,
    subheadline: personalization.subheadline || DEFAULTS.subheadline,
    cta:         personalization.cta         || DEFAULTS.cta,
    socialProof: personalization.socialProof || DEFAULTS.socialProof,
    loading: personalization.needsAI,
    aiGenerated: false,
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    if (!personalization.needsAI) return

    fetch('/api/personalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        utmTerm:     personalization.utmTerm,
        utmCampaign: personalization.utmCampaign,
        dealerType:  personalization.dealerType,
        abVariant:   personalization.abVariant,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.headline) {
          setContent({
            headline:    data.headline,
            subheadline: data.subheadline,
            cta:         data.cta,
            socialProof: data.socialProof,
            loading: false,
            aiGenerated: true,
          })
          fetch('/api/ab-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'hero_impression',
              abVariant: personalization.abVariant,
              utmTerm: personalization.utmTerm,
              headline: data.headline,
              aiGenerated: true,
            }),
          }).catch(() => {})
        } else {
          setContent(c => ({ ...c, loading: false }))
        }
      })
      .catch(() => setContent(c => ({ ...c, loading: false })))
  }, [])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            background: '#ffa500',
            color: '#2a2b3c',
            fontWeight: 700,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            letterSpacing: '0.08em',
          }}>DA</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ffffff' }}>
            DealerAddendums
          </span>
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
          <a
            href="https://app.dealeraddendums.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 14px',
              fontSize: 14,
              color: 'rgba(255,255,255,0.8)',
              borderRadius: 4,
              cursor: 'pointer',
              marginRight: 8,
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
          >
            Log In
          </a>
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
            {content.loading ? (
              <div aria-busy="true" aria-label="Loading personalized content">
                <div className="skeleton-pulse" style={{ height: 16, width: 220, marginBottom: 20, borderRadius: 4 }} />
                <div className="skeleton-pulse" style={{ height: 42, width: '90%', marginBottom: 12, borderRadius: 4 }} />
                <div className="skeleton-pulse" style={{ height: 42, width: '70%', marginBottom: 24, borderRadius: 4 }} />
                <div className="skeleton-pulse" style={{ height: 20, width: '95%', marginBottom: 8, borderRadius: 4 }} />
                <div className="skeleton-pulse" style={{ height: 20, width: '80%', marginBottom: 32, borderRadius: 4 }} />
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="skeleton-pulse" style={{ height: 44, width: 160, borderRadius: 4 }} />
                  <div className="skeleton-pulse" style={{ height: 20, width: 200, borderRadius: 4 }} />
                </div>
              </div>
            ) : (
              <>
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
                  {personalization.staticMatch || content.aiGenerated
                    ? `Personalized for ${personalization.utmTerm || 'you'}`
                    : '1,644 Dealerships · $993M in Addendums'}
                </div>

                <h1
                  data-ab-variant={personalization.abVariant}
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.2,
                    margin: '0 0 20px',
                  }}
                >
                  {content.headline}
                </h1>

                <p style={{
                  fontSize: 18,
                  color: 'rgba(255,255,255,0.8)',
                  lineHeight: 1.65,
                  margin: '0 0 32px',
                }}>
                  {content.subheadline}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
                  <a
                    href="#signup"
                    data-track="hero-cta"
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
                    {content.cta}
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

                <p style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.4)',
                  margin: '14px 0 0',
                }}>
                  {content.socialProof} · No credit card required · Cancel anytime
                </p>
              </>
            )}
          </div>

          {/* Right: live stats */}
          <div style={{ display: 'grid', gap: 12, width: 210 }}>
            {[
              { value: '1,644', label: 'Active Dealerships' },
              { value: '526', label: 'Addendums Today' },
              { value: '2,347,023', label: 'Total Printed' },
              { value: '$993M+', label: 'Addendum Value' },
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
