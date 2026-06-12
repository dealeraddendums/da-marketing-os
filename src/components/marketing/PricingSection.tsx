const PLANS = [
  {
    name: 'Trial / Manual Load',
    price: '$100',
    period: '/month',
    desc: 'Start free — no credit card. Perfect for dealers who load vehicles manually or via spreadsheet.',
    cta: 'Start Free Trial',
    features: [
      'Unlimited addendums',
      'Print addendums, buyers guides, info sheets & QR stickers',
      '25 free labels included',
      'Single vehicle or Excel import',
      'Custom dealer logo & branding',
      'FTC Buyers Guides (English & Spanish)',
      '24/7 support',
    ],
    addons: [],
    highlight: false,
  },
  {
    name: 'Automatic — Web',
    price: '$150',
    period: '/month',
    desc: 'Our most popular plan. Inventory pulls automatically from any website provider or syndication company — no manual entry.',
    cta: 'Start Free Trial',
    features: [
      'Unlimited addendums',
      'Automatic inventory from any provider',
      'Rules-based product assignment',
      'All templates & document types',
      'FTC Buyers Guides (English & Spanish)',
      'CPO Info Sheets',
      'iOS DA Installer app included',
      'Custom logo, branding & watermarks',
      'Multi-rooftop group discounts',
      '24/7 support',
    ],
    addons: [
      'Color-Matched Vehicle Images — +$50/mo',
    ],
    highlight: true,
  },
  {
    name: 'Automatic — DMS',
    price: '$200',
    period: '/month',
    desc: 'Direct DMS integration for the fastest, most accurate inventory sync available.',
    cta: 'Start Free Trial',
    features: [
      'Everything in Automatic — Web',
      'Direct DMS integration',
      '2-way inventory data feed',
      'Labels 22–30¢ each depending on quantity',
      'AI vehicle descriptions',
      'Multi-rooftop group discounts',
      '24/7 priority support',
    ],
    addons: [
      'Color-Matched Vehicle Images — +$50/mo',
    ],
    highlight: false,
  },
]

export default function PricingSection() {
  return (
    <section
      id="pricing"
      style={{
        background: '#f5f6f7',
        padding: '72px 24px',
        fontFamily: "'Roboto', sans-serif",
        borderTop: '1px solid #e0e0e0',
        borderBottom: '1px solid #e0e0e0',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#2a2b3c',
            margin: '0 0 12px',
          }}>
            Simple, Transparent Pricing
          </h2>
          <p style={{
            fontSize: 16,
            color: '#55595c',
            margin: '0 auto 16px',
            maxWidth: 460,
            lineHeight: 1.6,
          }}>
            Month-to-month. No contracts. No setup fees. Cancel anytime.
          </p>
          <span style={{
            display: 'inline-block',
            background: '#e8f5e9',
            color: '#2e7d32',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 14px',
          }}>
            Instant Free Trial — No Credit Card Required
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
          alignItems: 'start',
        }}>
          {PLANS.map(plan => (
            <div
              key={plan.name}
              style={{
                background: '#ffffff',
                border: plan.highlight ? '2px solid #1976d2' : '1px solid #e0e0e0',
                borderRadius: 6,
                padding: 28,
                position: 'relative',
              }}
            >
              {plan.highlight && (
                <div style={{
                  position: 'absolute',
                  top: -13,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1976d2',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 14px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                }}>
                  MOST POPULAR
                </div>
              )}

              <div style={{
                fontSize: 15,
                fontWeight: 700,
                color: '#2a2b3c',
                marginBottom: 8,
              }}>
                {plan.name}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 10 }}>
                <span style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: '#333333',
                  lineHeight: 1,
                }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 14, color: '#78828c' }}>{plan.period}</span>
              </div>

              <p style={{
                fontSize: 13,
                color: '#55595c',
                lineHeight: 1.55,
                margin: '0 0 20px',
                minHeight: 42,
              }}>
                {plan.desc}
              </p>

              <a
                href="#signup"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  background: plan.highlight ? '#1976d2' : '#ffffff',
                  color: plan.highlight ? '#ffffff' : '#333333',
                  border: `1px solid ${plan.highlight ? '#1976d2' : '#e0e0e0'}`,
                  height: 38,
                  lineHeight: '38px',
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginBottom: 22,
                  textDecoration: 'none',
                }}
              >
                {plan.cta}
              </a>

              <div style={{
                borderTop: '1px solid #e0e0e0',
                paddingTop: 18,
                display: 'grid',
                gap: 10,
              }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: '#4caf50', fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: '#55595c', lineHeight: 1.5 }}>{f}</span>
                  </div>
                ))}

                {plan.addons.length > 0 && (
                  <>
                    <div style={{
                      borderTop: '1px solid #f0f0f0',
                      marginTop: 6,
                      paddingTop: 10,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#78828c',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                    }}>
                      Available Add-Ons
                    </div>
                    {plan.addons.map(a => (
                      <div key={a} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: '#1976d2', fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>+</span>
                        <span style={{ fontSize: 13, color: '#78828c', lineHeight: 1.5 }}>{a}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Group pricing note */}
        <div style={{
          marginTop: 28,
          textAlign: 'center',
          fontSize: 13,
          color: '#78828c',
        }}>
          Managing multiple rooftops?{' '}
          <a href="#signup" style={{ color: '#1976d2', fontWeight: 500 }}>
            Ask about group pricing
          </a>
          {' '}— discounts available for 2+ locations.
        </div>

      </div>
    </section>
  )
}
