'use client'
import { useEffect, useRef, useState } from 'react'
import { normalizeWebsiteUrl } from '@/lib/website-url'
import { formatUsPhone } from '@/lib/phone-format'
import {
  getAttribution, pushSignupEvent, getGaIds, sendFormStartOncePerSession,
} from '@/lib/attribution'
import Turnstile from './Turnstile'
import { capture, abTrackOnce } from './HeroSection'
import type { HeroTracking } from '@/lib/hero-engine'

interface FormState {
  name: string
  email: string
  dealership: string
  brand: string
  phone: string
  zip: string
  website: string
  // Filled by the name+ZIP business lookup (/api/enrich-business); editable.
  address: string
  city: string
  state: string
}

type AccountKind = 'single' | 'group' | 'partner'

// Per-tab wording for the business-name/website fields and placeholders.
const KIND_COPY: Record<AccountKind, { entity: string; entityPh: string; site: string; sitePh: string }> = {
  single: { entity: 'Dealership Name', entityPh: 'Smith Ford Lincoln', site: 'Dealership Website', sitePh: 'yourdealership.com' },
  group: { entity: 'Group Name', entityPh: 'Acme Auto Group', site: 'Group Website', sitePh: 'yourgroup.com' },
  partner: { entity: 'Company Name', entityPh: 'Elite Auto Styling', site: 'Company Website', sitePh: 'yourcompany.com' },
}

interface Props {
  // Dynamic Landing Engine context — optional so legacy render sites compile.
  tracking?: HeroTracking
  // Footer "Resources" links (featured published blog posts) — passed from the
  // server page (this is a client component, it can't read content/posts).
  resources?: Array<{ slug: string; title: string }>
}

export default function CTASection({ tracking, resources }: Props) {
  const [form, setForm] = useState<FormState>({ name: '', email: '', dealership: '', brand: '', phone: '', zip: '', website: '', address: '', city: '', state: '' })
  // Brand list (Phase 6c): makes first, Reseller/Upfitter/Other grouped at the bottom.
  const [brandOptions, setBrandOptions] = useState<{ brand: string; kind: 'make' | 'generic' | 'combo' }[]>([])
  // Pre-fill stops the moment the visitor picks a brand themselves.
  const brandTouched = useRef(false)
  const [accountKind, setAccountKind] = useState<AccountKind>('single')
  // Business lookup (name + ZIP → corrected name, address, city/state, phone).
  const [enrich, setEnrich] = useState<'idle' | 'looking' | 'places' | 'fallback'>('idle')
  const [enrichMsg, setEnrichMsg] = useState('')
  // Once the visitor edits an address field themselves, the lookup stops
  // overwriting those fields (the name correction still applies).
  const addrTouched = useRef(false)
  const lookupDone = useRef<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [existing, setExisting] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  // Sign-ups are accepted 5 AM–9 PM Pacific (the server enforces it; this is
  // just so nobody fills in the form at 3 AM and gets a surprise). Computed
  // with the IANA zone so it follows DST, and re-checked every minute in case
  // the page sits open across the boundary.
  const [afterHours, setAfterHours] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendMsg, setResendMsg] = useState('')
  useEffect(() => {
    const check = () => {
      const hh = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23',
      }).format(new Date())
      const h = Number.parseInt(hh, 10)
      setAfterHours(!(h >= 5 && h < 21))
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [])
  const formStarted = useRef(false)

  // Deep-linkable tab: /?signup=group#signup (or signup=partner) preselects it
  // (set post-mount to avoid a hydration mismatch).
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('signup')
    if (want === 'group' || want === 'partner') setAccountKind(want)
  }, [])

  const handleFormStart = () => {
    // GA4 gets form_start once per SESSION, which is the semantics GA4 itself
    // uses — and it is guarded inside the helper via sessionStorage rather than
    // by the ref below, which only survives until this component remounts.
    sendFormStartOncePerSession()
    if (formStarted.current) return
    formStarted.current = true
    abTrackOnce('da_ev_formstart', 'form_start', tracking) // funnel (ab_events)
    if (tracking) capture('form_start', tracking)          // PostHog
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  // Address fields: same, but remember the visitor took over.
  const handleAddrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addrTouched.current = true
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  // Phone formats as typed: "9416003300" → "(941) 600-3300".
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = formatUsPhone(e.target.value)
    setForm(f => ({ ...f, phone: value }))
  }

  // Business lookup — debounced on the two driving fields (name + ZIP). The
  // server route proxies DA Platform's Google Places search (key stays
  // server-side) and falls back to smart title-case + a free ZIP→city/state
  // lookup. Everything it fills stays editable; one lookup per distinct
  // name+ZIP (the corrected name is marked done too, so applying a result
  // doesn't trigger a second search).
  useEffect(() => {
    const name = form.dealership.trim()
    const zip = form.zip.trim().match(/^(\d{5})(-\d{4})?$/)?.[1]
    if (name.length < 3 || !zip) return
    const kind = accountKind === 'partner' ? 'partner' : 'dealer'
    const key = `${name.toLowerCase()}|${zip}|${kind}`
    if (lookupDone.current.has(key)) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setEnrich('looking')
      fetch('/api/enrich-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, zip, kind }),
        signal: ctrl.signal,
      })
        .then(r => (r.ok ? r.json() : null))
        .then((d: { source?: string; name?: string; street?: string | null; city?: string | null; state?: string | null; phone?: string | null } | null) => {
          if (ctrl.signal.aborted) return
          lookupDone.current.add(key)
          if (!d) { setEnrich('idle'); return }
          if (d.name) lookupDone.current.add(`${d.name.trim().toLowerCase()}|${zip}|${kind}`)
          setForm(f => ({
            ...f,
            dealership: d.name || f.dealership,
            address: !addrTouched.current && d.street ? d.street : f.address,
            city: !addrTouched.current && d.city ? d.city : f.city,
            state: !addrTouched.current && d.state ? d.state : f.state,
            phone: f.phone || (d.phone ? formatUsPhone(d.phone) : ''),
          }))
          if (d.source === 'places') {
            setEnrich('places')
            setEnrichMsg(`Found “${d.name}” — we filled in the address. Adjust anything that looks off.`)
          } else {
            setEnrich('fallback')
            setEnrichMsg(d.city ? 'We tidied up the name and filled in your city and state.' : '')
          }
        })
        .catch(() => { if (!ctrl.signal.aborted) setEnrich('idle') })
    }, 900)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [form.dealership, form.zip, accountKind])

  // Debounced availability check (same-origin proxy → DA Platform; the API
  // key stays server-side). Fail-open: errors return to idle and never block
  // — the signup endpoint's duplicate guard is the real gate.
  useEffect(() => {
    const email = form.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailStatus('idle')
      return
    }
    setEmailStatus('checking')
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/check-email?email=${encodeURIComponent(email)}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : null))
        .then((d: { available?: boolean } | null) => {
          if (d == null) setEmailStatus('idle')
          else setEmailStatus(d.available === false ? 'taken' : 'available')
        })
        .catch(() => { if (!ctrl.signal.aborted) setEmailStatus('idle') })
    }, 500)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [form.email])

  useEffect(() => {
    fetch('/api/brands').then((r) => (r.ok ? r.json() : null))
      .then((j) => setBrandOptions(j?.brands ?? [])).catch(() => {})
  }, [])

  // Pre-fill the brand from the dealership name ("Wyatt Johnson Ford" -> Ford),
  // via the platform's logo-franchises inference. Editable; stops once touched.
  useEffect(() => {
    if (accountKind !== 'single' || brandTouched.current || form.dealership.trim().length < 4) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/brands?infer=${encodeURIComponent(form.dealership.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!ctrl.signal.aborted && j?.inferred && !brandTouched.current) {
            setForm((f) => ({ ...f, brand: j.inferred }))
          }
        })
        .catch(() => {})
    }, 600)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [form.dealership, accountKind])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.dealership || !form.zip || !form.website.trim()
      || (accountKind === 'single' && !form.brand)) {
      setErrorMsg('Please fill in all required fields.')
      return
    }
    // Same rules the server applies (src/lib/website-url.ts): forgiving on
    // input ("yourdealer.com" is fine), http(s) only, must look like a domain.
    const site = normalizeWebsiteUrl(form.website)
    if (!site.ok) {
      setErrorMsg(site.error)
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
          brand: accountKind === 'single' ? form.brand : undefined,
          website: site.url,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          state: form.state.trim() || undefined,
          ...getAttribution(),
          // GA4 identity from THIS session, stored on the lead so the
          // trial_signup conversion sent at email-confirmation time (a
          // different session) still attributes to the channel that earned it.
          ...getGaIds(),
          accountKind,
          // Group AND partner signups provision a group named after the business.
          groupName: accountKind !== 'single' ? form.dealership : undefined,
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

  // Resend the Layer 0 confirmation email. The endpoint answers identically for
  // every outcome (unknown address, cooldown, sent), so there is nothing to
  // branch on here — we just report that it went out.
  async function handleResend() {
    if (resendState === 'sending') return
    setResendState('sending')
    setResendMsg('')
    try {
      const res = await fetch('/api/leads/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResendState('idle')
        setResendMsg(data?.error || 'Could not resend just now — please try again shortly.')
        return
      }
      setResendState('sent')
      setResendMsg(data?.message || 'Confirmation email resent.')
    } catch {
      setResendState('idle')
      setResendMsg('Could not resend just now — please try again shortly.')
    }
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
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
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
          ) : accountKind === 'partner' ? (
            <div>
              <h2 style={{
                fontSize: 28,
                fontWeight: 600,
                color: '#ffffff',
                margin: '0 0 16px',
                lineHeight: 1.3,
              }}>
                Service dealerships? Partner with us.
              </h2>
              <p style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7,
                margin: '0 0 24px',
              }}>
                A Partner account is built for resellers and service providers — window tint
                and paint-protection installers, dent &amp; ding teams, restylers and upfitters,
                and companies selling protection products across multiple rooftops. One master
                login, a store for every dealership you service, professional addendums with
                your work itemized on every window.
              </p>
              <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
                {[
                  'One account covering every dealership you service',
                  'Unlimited templates — set up each store once, print daily',
                  'Present your products and pricing right on the window sticker',
                  'US-based support team, real people',
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
              <p style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.7,
                margin: 0,
              }}>
                Running a dealership instead?{' '}
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
                .
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
                    <>We just emailed you an <strong>8-digit setup code</strong>. Enter it on the next screen (or tap the button in the email) and your free trial opens right away — your account is created the moment you enter it.</>
                  )}
                </p>
                {!existing && (
                  <p style={{ fontSize: 14, margin: '14px 0 0' }}>
                    <a
                      href={`https://app.dealeraddendums.com/onboard?email=${encodeURIComponent(form.email.trim())}`}
                      style={{ color: '#1976d2', fontWeight: 600 }}
                    >
                      I have my code — enter it now →
                    </a>
                  </p>
                )}
                {!existing && (
                  <div style={{ marginTop: 18 }}>
                    {resendState === 'sent' ? (
                      <p style={{ fontSize: 13, color: '#55595c', lineHeight: 1.6, margin: 0 }}>{resendMsg}</p>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, color: '#55595c', margin: '0 0 8px' }}>
                          Didn&apos;t get it? Check your spam folder first.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleResend()}
                          disabled={resendState === 'sending'}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            font: 'inherit',
                            fontSize: 13,
                            fontWeight: 600,
                            color: resendState === 'sending' ? '#999999' : '#1976d2',
                            cursor: resendState === 'sending' ? 'default' : 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          {resendState === 'sending' ? 'Sending…' : 'Resend the code'}
                        </button>
                        {resendMsg && (
                          <p style={{ fontSize: 12, color: '#c62828', margin: '8px 0 0' }}>{resendMsg}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
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

                {/* Single store / Dealer group / Partner choice */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  border: '1px solid #cccccc',
                  borderRadius: 6,
                  overflow: 'hidden',
                  marginBottom: 16,
                }}>
                  {(['single', 'group', 'partner'] as const).map(kind => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setAccountKind(kind)}
                      style={{
                        minHeight: 40,
                        padding: '4px 2px',
                        border: 'none',
                        background: accountKind === kind ? '#1976d2' : '#ffffff',
                        color: accountKind === kind ? '#ffffff' : '#555555',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'Roboto', sans-serif",
                        lineHeight: 1.25,
                      }}
                    >
                      {kind === 'single' ? 'Single store' : kind === 'group' ? 'Dealer group' : 'Partner / Reseller'}
                    </button>
                  ))}
                </div>

                <div className="signup-fields">
                  {/* 1 — the business name + ZIP drive the lookup, so they lead. */}
                  <div className="sf-full">
                    <label htmlFor="dealership" style={{ ...labelStyle, color: '#55595c' }}>
                      {KIND_COPY[accountKind].entity} <span style={{ color: '#ff5252' }}>*</span>
                    </label>
                    <input
                      id="dealership"
                      name="dealership"
                      type="text"
                      value={form.dealership}
                      onChange={handleChange}
                      placeholder={KIND_COPY[accountKind].entityPh}
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
                      onChange={handlePhoneChange}
                      placeholder="(555) 000-0000"
                      style={inputStyle}
                    />
                  </div>

                  {enrich === 'looking' && (
                    <p className="sf-full" style={{ margin: 0, fontSize: 12, color: '#78828c' }}>
                      Looking up your business…
                    </p>
                  )}
                  {enrich !== 'looking' && enrichMsg && (
                    <p className="sf-full" style={{ margin: 0, fontSize: 12, color: '#2e7d32' }}>
                      ✓ {enrichMsg}
                    </p>
                  )}

                  {/* Street address appears only once the lookup (or the
                      visitor) has one — no blank manual address box. */}
                  {form.address.trim() !== '' && (
                    <div className="sf-full">
                      <label htmlFor="address" style={{ ...labelStyle, color: '#55595c' }}>
                        Street Address
                      </label>
                      <input
                        id="address"
                        name="address"
                        type="text"
                        maxLength={160}
                        value={form.address}
                        onChange={handleAddrChange}
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {(form.city.trim() !== '' || form.state.trim() !== '') && (
                    <>
                      <div>
                        <label htmlFor="city" style={{ ...labelStyle, color: '#55595c' }}>City</label>
                        <input
                          id="city"
                          name="city"
                          type="text"
                          maxLength={80}
                          value={form.city}
                          onChange={handleAddrChange}
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label htmlFor="state" style={{ ...labelStyle, color: '#55595c' }}>State</label>
                        <input
                          id="state"
                          name="state"
                          type="text"
                          maxLength={40}
                          value={form.state}
                          onChange={handleAddrChange}
                          style={inputStyle}
                        />
                      </div>
                    </>
                  )}

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
                    {emailStatus === 'checking' && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#78828c' }}>Checking…</p>
                    )}
                    {emailStatus === 'available' && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4caf50' }}>✓ Email is available</p>
                    )}
                    {emailStatus === 'taken' && (
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ff5252' }}>
                        ✗ This email is already registered — <a href="https://app.dealeraddendums.com" style={{ color: '#1976d2' }}>log in instead</a>
                      </p>
                    )}
                  </div>

                  {accountKind === 'single' && (
                    <div>
                      <label htmlFor="brand" style={{ ...labelStyle, color: '#55595c' }}>
                        Brand <span style={{ color: '#ff5252' }}>*</span>
                      </label>
                      <select
                        id="brand"
                        name="brand"
                        value={form.brand}
                        onChange={(e) => { brandTouched.current = true; setForm((f) => ({ ...f, brand: e.target.value })) }}
                        style={{ ...inputStyle, appearance: 'auto' as const }}
                        required
                      >
                        <option value="">Select your brand…</option>
                        <optgroup label="Makes">
                          {/* Combo brands (CDJR / CDJRF) list WITH the makes, first (their sort
                              puts them at the top) — extremely common franchise combos. */}
                          {brandOptions.filter((b) => b.kind === 'make' || b.kind === 'combo').map((b) => (
                            <option key={b.brand} value={b.brand}>{b.brand}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Not a franchise dealer?">
                          {brandOptions.filter((b) => b.kind === 'generic').map((b) => (
                            <option key={b.brand} value={b.brand}>{b.brand}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  )}

                  <div className={accountKind === 'single' ? undefined : 'sf-full'}>
                    <label htmlFor="website" style={{ ...labelStyle, color: '#55595c' }}>
                      {KIND_COPY[accountKind].site} <span style={{ color: '#ff5252' }}>*</span>
                    </label>
                    <input
                      id="website"
                      name="website"
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      maxLength={500}
                      value={form.website}
                      onChange={handleChange}
                      placeholder={KIND_COPY[accountKind].sitePh}
                      style={inputStyle}
                      required
                    />
                  </div>

                  {errorMsg && (
                    <p className="sf-full" style={{ margin: 0, fontSize: 12, color: '#ff5252' }}>{errorMsg}</p>
                  )}

                  {afterHours && (
                    <p className="sf-full" style={{
                      margin: 0, fontSize: 12, lineHeight: 1.5,
                      background: '#fff8e1', border: '1px solid #ffe082', color: '#7a5c00',
                      padding: '8px 10px', borderRadius: 4,
                    }}>
                      Sign-ups are open 5&nbsp;AM–9&nbsp;PM Pacific — please try again during
                      business hours, or email{' '}
                      <a href="mailto:support@dealeraddendums.com" style={{ color: '#7a5c00' }}>support@dealeraddendums.com</a>.
                    </p>
                  )}

                  <div className="sf-full">
                    <Turnstile onVerify={setTurnstileToken} />
                  </div>

                  <button
                    className="sf-full"
                    type="submit"
                    disabled={afterHours || status === 'loading' || emailStatus === 'checking' || emailStatus === 'taken'}
                    style={{
                      height: 44,
                      background: afterHours || status === 'loading' || emailStatus === 'checking' || emailStatus === 'taken' ? '#f5f6f7' : '#4caf50',
                      color: afterHours || status === 'loading' || emailStatus === 'checking' || emailStatus === 'taken' ? '#78828c' : '#ffffff',
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
                    {status === 'loading' ? 'Submitting…' : afterHours ? 'Sign-ups reopen at 5 AM Pacific' : 'Start Free Trial — No Credit Card'}
                  </button>

                  <p className="sf-full" style={{
                    fontSize: 12,
                    color: '#78828c',
                    textAlign: 'center',
                    margin: 0,
                  }}>
                    30-day free trial · Month-to-month · Cancel anytime
                  </p>

                  <p className="sf-full" style={{ fontSize: 12, color: '#78828c', textAlign: 'center', margin: 0 }}>
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

      {/* Footer — Resources row (featured published blog posts) */}
      {resources && resources.length > 0 && (
        <div style={{
          maxWidth: 1100,
          margin: '48px auto 0',
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: '8px 24px',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Resources
          </span>
          {resources.map(r => (
            <a key={r.slug} href={`/blog/${r.slug}`} style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', textDecoration: 'none' }}>
              {r.title}
            </a>
          ))}
          <a href="/blog" style={{ fontSize: 13, color: '#ffa500', textDecoration: 'none', fontWeight: 500 }}>
            All articles →
          </a>
        </div>
      )}

      {/* Footer */}
      <div style={{
        maxWidth: 1100,
        margin: resources && resources.length > 0 ? '24px auto 0' : '56px auto 0',
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
        <a href="https://apps.apple.com/us/app/dealeraddendums-5-0/id6788451484" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/app-store-badge.svg" alt="Download on the App Store" style={{ height: 36, display: 'block' }} />
        </a>
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
