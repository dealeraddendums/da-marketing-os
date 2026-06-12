'use client'
import { useState } from 'react'
import Image from 'next/image'
import type { PersonalizationContext } from '@/lib/personalization'
import { getAttribution, pushSignupEvent } from '@/lib/attribution'
import Turnstile from './Turnstile'

interface Props {
  personalization: PersonalizationContext
}

const FEATURES = [
  {
    icon: '📄',
    title: 'Vehicle Addendums',
    desc: 'Auto-applies products based on year, make, model, trim, bodystyle, and mileage. Set it once — runs forever.',
  },
  {
    icon: '⚖️',
    title: 'FTC Buyers Guides',
    desc: 'As-Is, Implied, or Warranty Buyers Guides in English and Spanish, printed in seconds with one click.',
  },
  {
    icon: '🏷️',
    title: 'CPO Info Sheets',
    desc: 'Pre-Owned and CPO Vehicle Information Sheets with logo, vehicle details, description, options, and QR code.',
  },
  {
    icon: '📱',
    title: 'iOS Mobile App',
    desc: 'Scan VINs on the lot, create and print addendums remotely with the DA Installer iOS app. ($10/mo add-on)',
  },
  {
    icon: '🔲',
    title: 'SMS Lead Capture',
    desc: 'QR codes on addendums capture buyer name, phone, and vehicle interest automatically via SMS. ($50/mo add-on)',
  },
  {
    icon: '🤖',
    title: 'AI Vehicle Descriptions',
    desc: 'AI-generated, SEO-compliant vehicle descriptions for every unit — built into your addendum workflow.',
  },
  {
    icon: '🔄',
    title: '2-Way Inventory Sync',
    desc: 'We pull your inventory automatically and push addendum data back to your website and syndication partners.',
  },
  {
    icon: '🏢',
    title: 'Multi-Rooftop Groups',
    desc: 'One account for all your locations. Group discounts and consistent branding across every store.',
  },
]

const TESTIMONIALS = [
  {
    quote: "Your product rocks — super easy to use and intuitive.",
    name: 'Jason Falbo',
    dealership: 'Finnegan CDJR',
  },
  {
    quote: "I absolutely love it and using it — it makes my job a whole lot easier!",
    name: 'Christine',
    dealership: 'Townsend Honda',
  },
  {
    quote: "We got tired of wrestling with Reynolds' antiquated addendum system. Now we have 8 rooftops using DealerAddendums. It couldn't be easier to use, or an easier decision to make!",
    name: 'Phillip Taylor',
    dealership: 'Stevenson Automotive Group',
  },
  {
    quote: "Great service, great pricing, and anytime I need help, I am given remote support right away!",
    name: 'Amy',
    dealership: 'Spradley Kia Mazda',
  },
]

const PLANS = [
  {
    name: 'Trial / Manual Load',
    price: '$100',
    period: '/mo',
    features: ['75 addendums/month', 'Manual or Excel import', 'FTC Buyers Guides', 'Custom branding', '25 free labels', '24/7 support'],
    highlight: false,
  },
  {
    name: 'Automatic — Web',
    price: '$150',
    period: '/mo',
    features: ['Unlimited addendums', 'Automatic inventory import', 'All document types', 'FTC Buyers Guides (EN + ES)', 'CPO Info Sheets', 'Multi-rooftop discounts', '24/7 support'],
    highlight: true,
  },
  {
    name: 'Automatic — DMS',
    price: '$200',
    period: '/mo',
    features: ['Everything in Web plan', 'Direct DMS integration', '2-way inventory feed', 'Labels 22–30¢ each depending on quantity', 'AI vehicle descriptions', '24/7 priority support'],
    highlight: false,
  },
]

type DealerTab = 'dealer' | 'group'

interface FormState {
  name: string
  dealership: string
  email: string
  phone: string
  state: string
  dealerType: string
  groupSize: string
  heardFrom: string
}

export default function LayoutA({ personalization }: Props) {
  const [activeTab, setActiveTab] = useState<DealerTab>('dealer')
  const [form, setForm] = useState<FormState>({
    name: '', dealership: '', email: '', phone: '',
    state: '', dealerType: 'both', groupSize: '', heardFrom: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [existing, setExisting] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.dealership) {
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
          accountType: activeTab,
          accountKind: activeTab === 'group' ? 'group' : 'single',
          groupName: activeTab === 'group' ? form.dealership : undefined,
          turnstileToken,
          layoutVariant: 'a',
          abVariant: personalization.abVariant,
          utmTerm: personalization.utmTerm,
          contextKey: personalization.contextKey,
          variationId: personalization.variationId,
          headlineSeen: personalization.headline ?? undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => ({} as { existing?: boolean }))
        setExisting(!!data.existing)
        setStatus('success')
        pushSignupEvent()
        fetch('/api/ab-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'conversion',
            abVariant: personalization.abVariant,
            layoutVariant: 'a',
            utmTerm: personalization.utmTerm,
          }),
        }).catch(() => {})
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
    height: 38,
    border: '1px solid #cccccc',
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
    color: '#555555',
    marginBottom: 5,
  }

  return (
    <div style={{ fontFamily: "'Roboto', sans-serif" }}>

      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav style={{
        background: '#ffffff',
        borderBottom: '1px solid #e0e0e0',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-dark.svg"
            alt="DealerAddendums"
            width={212}
            height={24}
            style={{ display: 'block' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {['Features', 'Pricing', 'Testimonials'].map(label => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              style={{
                padding: '6px 14px',
                fontSize: 14,
                color: '#555555',
                textDecoration: 'none',
                borderRadius: 4,
              }}
            >
              {label}
            </a>
          ))}
          <a
            href="https://app.dealeraddendums.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 16px',
              fontSize: 14,
              color: '#1976d2',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Log In
          </a>
          <a
            href="#signup"
            style={{
              background: '#1976d2',
              color: '#ffffff',
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            Free Trial
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{
        background: '#f0f4f8',
        padding: '72px 32px',
        textAlign: 'center',
        borderBottom: '1px solid #dde3ec',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#2a2b3c',
            lineHeight: 1.25,
            margin: '0 0 18px',
          }}>
            DealerAddendums.com is an online subscription service for new and used vehicle dealers
          </h1>
          <p style={{
            fontSize: 18,
            color: '#555555',
            lineHeight: 1.65,
            margin: '0 0 32px',
            maxWidth: 620,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            Easily print customized vehicle addendums, buyers guides, and info sheets from your computer, tablet or our iOS app.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <a
              href="#signup"
              style={{
                background: '#1976d2',
                color: '#ffffff',
                height: 48,
                lineHeight: '48px',
                padding: '0 36px',
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 4,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Start Free Trial
            </a>
            <a
              href="https://app.dealeraddendums.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#ffffff',
                color: '#1976d2',
                height: 48,
                lineHeight: '46px',
                padding: '0 36px',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 4,
                textDecoration: 'none',
                border: '1px solid #1976d2',
                display: 'inline-block',
              }}
            >
              Login NOW!
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: '#78828c' }}>
            No credit card required · Month-to-month · Cancel anytime
          </p>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section style={{
        background: '#1976d2',
        padding: '48px 32px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#ffffff',
            margin: '0 0 32px',
          }}>
            Our Dealers Are Killing It!!
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
          }}>
            {[
              { value: '1,600+', label: 'Number of Dealers' },
              { value: '3.6M+', label: 'Addendums Printed' },
              { value: '$800M+', label: 'Total Addendum Value' },
              { value: '2014', label: 'Serving Dealers Since' },
            ].map(s => (
              <div key={s.label}>
                <div style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1,
                  marginBottom: 6,
                }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Addendum Examples ────────────────────────────────── */}
      <section style={{
        background: '#ffffff',
        padding: '64px 32px',
        borderBottom: '1px solid #e0e0e0',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: '#2a2b3c', margin: '0 0 10px' }}>
            See What Your Addendums Will Look Like
          </h2>
          <p style={{ fontSize: 15, color: '#55595c', margin: '0 0 36px' }}>
            Professional, branded documents printed in under 30 seconds.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
          }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden' }}>
                <Image
                  src={`https://www.dealeraddendums.com/hubfs/da-migrate%20files%20assets/images/img_${i}.jpg`}
                  alt={`Addendum example ${i}`}
                  width={280}
                  height={180}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" style={{ background: '#f5f6f7', padding: '64px 32px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: '#2a2b3c', textAlign: 'center', margin: '0 0 40px' }}>
            Everything You Need to Run Your Addendum Process
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{
                background: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: 6,
                padding: 20,
              }}>
                <div style={{ fontSize: 26, marginBottom: 10, lineHeight: 1 }}>{f.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2a2b3c', marginBottom: 6 }}>{f.title}</div>
                <p style={{ fontSize: 13, color: '#55595c', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section id="testimonials" style={{ background: '#ffffff', padding: '64px 32px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: '#2a2b3c', textAlign: 'center', margin: '0 0 40px' }}>
            What Dealers Are Saying
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{
                background: '#f5f6f7',
                border: '1px solid #e0e0e0',
                borderRadius: 6,
                padding: '22px 24px',
              }}>
                <div style={{ fontSize: 13, color: '#ffa500', marginBottom: 10, letterSpacing: 2 }}>★★★★★</div>
                <p style={{ fontSize: 14, color: '#333333', lineHeight: 1.7, margin: '0 0 14px', fontStyle: 'italic' }}>
                  "{t.quote}"
                </p>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2a2b3c' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: '#78828c' }}>{t.dealership}</div>
              </div>
            ))}
          </div>

          {/* Dealer Groups */}
          <div style={{ marginTop: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#78828c', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
              Trusted by Leading Dealer Groups
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 28px' }}>
              {['Lithia Motors', 'Larry H. Miller Automotive', 'Asbury Automotive Group', 'Sonic Automotive', 'Berkshire Hathaway Automotive', 'Ken Garff Automotive Group'].map(name => (
                <span key={name} style={{ fontSize: 13, fontWeight: 500, color: '#55595c' }}>{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" style={{ background: '#f5f6f7', padding: '64px 32px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: '#2a2b3c', margin: '0 0 10px' }}>
              Start Out With an Instant Free Trial
            </h2>
            <p style={{ fontSize: 15, color: '#55595c', margin: 0 }}>
              Month-to-month. No contracts. No setup fees.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {PLANS.map(plan => (
              <div key={plan.name} style={{
                background: '#ffffff',
                border: plan.highlight ? '2px solid #1976d2' : '1px solid #e0e0e0',
                borderRadius: 6,
                padding: 24,
                position: 'relative',
              }}>
                {plan.highlight && (
                  <div style={{
                    position: 'absolute',
                    top: -12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1976d2',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 14px',
                    borderRadius: 20,
                    whiteSpace: 'nowrap',
                  }}>MOST POPULAR</div>
                )}
                <div style={{ fontSize: 15, fontWeight: 700, color: '#2a2b3c', marginBottom: 6 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 16 }}>
                  <span style={{ fontSize: 32, fontWeight: 700, color: '#333333', lineHeight: 1 }}>{plan.price}</span>
                  <span style={{ fontSize: 13, color: '#78828c' }}>{plan.period}</span>
                </div>
                <a
                  href="#signup"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: plan.highlight ? '#1976d2' : '#ffffff',
                    color: plan.highlight ? '#ffffff' : '#333333',
                    border: `1px solid ${plan.highlight ? '#1976d2' : '#cccccc'}`,
                    height: 36,
                    lineHeight: '36px',
                    borderRadius: 4,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                    marginBottom: 18,
                  }}
                >
                  Sign Up Now
                </a>
                <div style={{ display: 'grid', gap: 8 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#4caf50', fontSize: 13, lineHeight: 1.5, flexShrink: 0 }}>✓</span>
                      <span style={{ fontSize: 13, color: '#55595c', lineHeight: 1.5 }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Sign Up Form ─────────────────────────────────────── */}
      <section id="signup" style={{ background: '#ffffff', padding: '72px 32px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: '#2a2b3c', margin: '0 0 10px' }}>
              Start Your Free Trial
            </h2>
            <p style={{ fontSize: 15, color: '#55595c', margin: 0 }}>
              No credit card required. Be up and running in minutes.
            </p>
          </div>

          {/* Dealer / Group toggle */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            border: '1px solid #cccccc',
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 24,
          }}>
            {(['dealer', 'group'] as DealerTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  height: 44,
                  border: 'none',
                  background: activeTab === tab ? '#1976d2' : '#ffffff',
                  color: activeTab === tab ? '#ffffff' : '#555555',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Roboto', sans-serif",
                  transition: 'background 0.15s',
                }}
              >
                {tab === 'dealer' ? "I'm a Dealer" : "I'm a Group / Reseller"}
              </button>
            ))}
          </div>

          {activeTab === 'group' && (
            <div style={{
              background: '#f5f6f7',
              border: '1px solid #e0e0e0',
              borderRadius: 6,
              padding: '14px 16px',
              marginBottom: 24,
              fontSize: 13,
              color: '#55595c',
              lineHeight: 1.6,
            }}>
              A Group account is one master login for an organization running multiple
              dealership locations — shared templates, pricing, and billing across every
              rooftop. If you&apos;re a single store — even one owned by a larger group —{' '}
              <button
                type="button"
                onClick={() => setActiveTab('dealer')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: '#1976d2',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                sign up on the &ldquo;I&apos;m a Dealer&rdquo; tab
              </button>
              . Your group&apos;s head office can add you to a Group account later.
            </div>
          )}

          {status === 'success' ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 24px',
              background: '#f0f8f0',
              border: '1px solid #c8e6c9',
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#2a2b3c', margin: '0 0 10px' }}>
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
            <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Your Name <span style={{ color: '#e53935' }}>*</span>
                </label>
                <input
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
                <label style={labelStyle}>
                  Dealership Name <span style={{ color: '#e53935' }}>*</span>
                </label>
                <input
                  name="dealership"
                  type="text"
                  value={form.dealership}
                  onChange={handleChange}
                  placeholder={activeTab === 'group' ? 'Acme Auto Group' : 'Smith Ford Lincoln'}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>
                    Work Email <span style={{ color: '#e53935' }}>*</span>
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@dealership.com"
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="(555) 000-0000"
                    style={inputStyle}
                  />
                </div>
              </div>

              {activeTab === 'dealer' && (
                <div>
                  <label style={labelStyle}>Dealer Type</label>
                  <select
                    name="dealerType"
                    value={form.dealerType}
                    onChange={handleChange}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="both">New &amp; Used</option>
                    <option value="new">New Only</option>
                    <option value="used">Used Only</option>
                  </select>
                </div>
              )}

              {activeTab === 'group' && (
                <div>
                  <label style={labelStyle}>Number of Rooftops</label>
                  <select
                    name="groupSize"
                    value={form.groupSize}
                    onChange={handleChange}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">Select…</option>
                    <option value="2-5">2–5 locations</option>
                    <option value="6-15">6–15 locations</option>
                    <option value="16+">16+ locations</option>
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>How did you hear about us?</label>
                <select
                  name="heardFrom"
                  value={form.heardFrom}
                  onChange={handleChange}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select…</option>
                  <option value="google">Google Search</option>
                  <option value="referral">Referral from another dealer</option>
                  <option value="20-group">20 Group</option>
                  <option value="social">Social Media</option>
                  <option value="tradeshow">Trade Show</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {errorMsg && (
                <p style={{ margin: 0, fontSize: 13, color: '#e53935' }}>{errorMsg}</p>
              )}

              <Turnstile onVerify={setTurnstileToken} />

              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  height: 48,
                  background: status === 'loading' ? '#e0e0e0' : '#1976d2',
                  color: status === 'loading' ? '#78828c' : '#ffffff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  fontFamily: "'Roboto', sans-serif",
                  width: '100%',
                }}
              >
                {status === 'loading' ? 'Submitting…' : 'Sign Up Now — Free Trial'}
              </button>

              <p style={{ fontSize: 12, color: '#78828c', textAlign: 'center', margin: 0 }}>
                Month-to-month · No setup fees · US-based support · Cancel anytime
              </p>

              <p style={{ fontSize: 12, color: '#78828c', textAlign: 'center', margin: 0 }}>
                By signing up, you agree to our{' '}
                <a href="/terms" style={{ color: '#1976d2', textDecoration: 'none' }}>Terms of Use</a>{' '}
                and{' '}
                <a href="/privacy" style={{ color: '#1976d2', textDecoration: 'none' }}>Privacy Policy</a>.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div style={{
        background: '#2a2b3c',
        padding: '28px 32px',
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
            Eastsound, WA · (801) 415-9435
          </span>
        </div>
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
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
          © 2025 DealerAddendums. All rights reserved.
        </p>
      </div>

    </div>
  )
}
