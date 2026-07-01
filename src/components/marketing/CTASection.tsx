'use client'
import { useEffect, useRef, useState } from 'react'
import { getAttribution, pushSignupEvent } from '@/lib/attribution'
import Turnstile from './Turnstile'
import { capture, abTrackOnce } from './HeroSection'
import type { HeroTracking } from '@/lib/hero-engine'

interface FormState {
  name: string
  email: string
  dealership: string
  phone: string
  zip: string
}

interface Props {
  // Dynamic Landing Engine context — optional so legacy render sites compile.
  tracking?: HeroTracking
}

export default function CTASection({ tracking }: Props) {
  const [form, setForm] = useState<FormState>({ name: '', email: '', dealership: '', phone: '', zip: '' })
  const [accountKind, setAccountKind] = useState<'single' | 'group'>('single')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [existing, setExisting] = useState(false)
  const formStarted = useRef(false)

  // Deep-linkable tab: /?signup=group#signup preselects the Dealer group tab
  // (set post-mount to avoid a hydration mismatch).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('signup') === 'group') {
      setAccountKind('group')
    }
  }, [])

  const handleFormStart = () => {
    if (formStarted.current) return
    formStarted.current = true
    abTrackOnce('da_ev_formstart', 'form_start', tracking) // funnel (ab_events)
    if (tracking) capture('form_start', tracking)          // PostHog
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.dealership || !form.zip) {
      setErrorMsg('Please fill in all required fields.')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...getAttribution(),
          accountKind,
          groupName: accountKind === 'group' ? form.dealership : undefined,
          turnstileToken,
          contextKey: tracking?.contextKey,
          variationId: tracking?.variationId,
          abVariant: tracking?.abVariant,
          headlineSeen: tracking?.headline,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({} as { existing?: boolean }))
        setExisting(!!data.existing)
        setStatus('success')
        pushSignupEvent()
        if (tracking) capture('lead', tracking, { account_kind: accountKind })
      } else {
        const data = await res.json()
        setErrorMsg(data.error || 'Submission failed — please try again.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Network error — please check your connection and try again.')
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 36,
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 4,
    padding: '0 12px',
    fontSize: 14,
    fontFamily: "'Roboto', sans-serif",
    color: '#333333',
    background: '#ffffff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  }

  return (
    <section
      id="signup"
      style={{
        background: '#2a2b3c',
        padding: '72px 24px',
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="signup-grid">

          {/* Left: copy — swaps when the Dealer group tab is selected */}
          {accountKind === 'group' ? (
            <div>
              <h2 style={{
                fontSize: 28,
                fontWeight: 600,
                color: '#ffffff',
                margin: '0 0 16px',
                lineHeight: 1.3,
              }}>
                Managing more than one store?
              </h2>
              <p style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7,
                margin: '0 0 20px',
              }}>
                A Group account is one master login for an organization that runs multiple
                dealership locations — set templates, products, and pricing once, print
                across every rooftop, and handle billing and multi-rooftop discounts from
                a single place.
              </p>
              <p style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7,
                margin: 0,
              }}>
                Most dealerships belong to a group of some kind, but that&apos;s not what
                this is for: if you&apos;re a single store — even one owned by a larger
                group —{' '}
                <button
                  type="button"
                  onClick={() => setAccountKind('single')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    color: '#ffa500',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  sign up on the Single store tab
                </button>
                . Your group&apos;s head office can add you to a Group account later.
              </p>
            </div>
          ) : (
          <div>
            <h2 style={{
              fontSize: 28,
              fontWeight: 600,
              color: '#ffffff',
              margin: '0 0 16px',
              lineHeight: 1.3,
            }}>
              Ready to Present Your Addendums the Professional Way?
            </h2>
            <p style={{
              fontSize: 15,
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.7,
              margin: '0 0 28px',
            }}>
              Start your free 30-day trial — print up to 30 clear, branded, transparent vehicle
              addendums. No credit card required. No contract. Be up and running in under 30 minutes.
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              {[
                'Up to 30 vehicle addendums during your trial',
                'All templates included — no upsells',
                'One-time shipment of 25 addendum labels (on request)',
                'US-based support team, real people',
                'Import your inventory automatically',
              ].map(item => (
                <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{
                    background: '#4caf50',
                    color: '#ffffff',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>✓</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Right: form */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            padding: 28,
          }}>
            {status === 'success' ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: 48,
                  height: 48,
                  background: '#e8f5e9',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  fontSize: 22,
                }}>✓</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#333333', margin: '0 0 10px' }}>
                  {existing ? 'You already have an account' : 'Check your email!'}
                </h3>
                <p style={{ fontSize: 14, color: '#55595c', lineHeight: 1.6, margin: 0 }}>
                  {existing ? (
                    <>It looks like an account already exists for this email. <a href="https://app.dealeraddendums.com" style={{ color: '#1976d2' }}>Log in here</a>.</>
                  ) : (
                    <>We just emailed you a secure link to finish setting up your account. Click it to activate your free trial.</>
                  )}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} onFocus={handleFormStart} noValidate>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#333333',
                  margin: '0 0 20px',
                  paddingBottom: 12,
                  borderBottom: '1px solid #e0e0e0',
                }}>
                  Start Your Free Trial
                </h3>

                {/* Single store / Dealer group choice */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  border: '1px solid #cccccc',
                  borderRadius: 6,
                  overflow: 'hidden',
                  marginBottom: 16,
                }}>
                  {(['single', 'group'] as const).map(kind => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setAccountKind(kind)}
                      style={{
                        height: 40,
                        border: 'none',
                        background: accountKind === kind ? '#1976d2' : '#ffffff',
                        color: accountKind === kind ? '#ffffff' : '#555555',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'Roboto', sans-serif",
                      }}
                    >
                      {kind === 'single' ? 'Single store' : 'Dealer group'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label htmlFor="name" style={{ ...labelStyle, color: '#55595c' }}>
                      Full Name <span style={{ color: '#ff5252' }}>*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="email" style={{ ...labelStyle, color: '#55595c' }}>
                      Work Email <span style={{ color: '#ff5252' }}>*</span>
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@yourdealership.com"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="dealership" style={{ ...labelStyle, color: '#55595c' }}>
                      {accountKind === 'group' ? 'Group Name' : 'Dealership Name'} <span style={{ color: '#ff5252' }}>*</span>
                    </label>
                    <input
                      id="dealership"
                      name="dealership"
                      type="text"
                      value={form.dealership}
                      onChange={handleChange}
                      placeholder={accountKind === 'group' ? 'Acme Auto Group' : 'Smith Ford Lincoln'}
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="zip" style={{ ...labelStyle, color: '#55595c' }}>
                      Zip Code <span style={{ color: '#ff5252' }}>*</span>
                    </label>
                    <input
                      id="zip"
                      name="zip"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={form.zip}
                      onChange={handleChange}
                      placeholder="12345"
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" style={{ ...labelStyle, color: '#55595c' }}>
                      Phone <span style={{ fontSize: 12, fontWeight: 400, color: '#78828c' }}>(optional)</span>
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="(555) 000-0000"
                      style={inputStyle}
                    />
                  </div>

                  {errorMsg && (
                    <p style={{ margin: 0, fontSize: 12, color: '#ff5252' }}>{errorMsg}</p>
                  )}

                  <Turnstile onVerify={setTurnstileToken} />

                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    style={{
                      height: 44,
                      background: status === 'loading' ? '#f5f6f7' : '#4caf50',
                      color: status === 'loading' ? '#78828c' : '#ffffff',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                      fontFamily: "'Roboto', sans-serif",
                      width: '100%',
                      opacity: status === 'loading' ? 0.7 : 1,
                    }}
                  >
                    {status === 'loading' ? 'Submitting…' : 'Start Free Trial — No Credit Card'}
                  </button>

                  <p style={{
                    fontSize: 12,
                    color: '#78828c',
                    textAlign: 'center',
                    margin: 0,
                  }}>
                    30-day free trial · Month-to-month · Cancel anytime
                  </p>

                  <p style={{ fontSize: 12, color: '#78828c', textAlign: 'center', margin: 0 }}>
                    By signing up, you agree to our{' '}
                    <a href="/terms" style={{ color: '#1976d2', textDecoration: 'none' }}>Terms of Use</a>{' '}
                    and{' '}
                    <a href="/privacy" style={{ color: '#1976d2', textDecoration: 'none' }}>Privacy Policy</a>.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        maxWidth: 1100,
        margin: '56px auto 0',
        paddingTop: 28,
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-light.svg"
            alt="DealerAddendums"
            width={160}
            height={18}
            style={{ display: 'block' }}
          />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            dealeraddendums.com
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Support', href: 'mailto:support@dealeraddendums.com' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
          © 2025 DealerAddendums. All rights reserved.
        </p>
      </div>
    </section>
  )
}
