const INQUIRY_MAILTO =
  'mailto:support@dealeraddendums.com' +
  '?subject=' + encodeURIComponent('Restyler / Upfitter account inquiry') +
  '&body=' + encodeURIComponent(
    `Hi DealerAddendums,

I'm interested in a Restyler / Upfitter account.

Company name:
How many dealerships do you serve?
Roughly how many addendums do you print per month?
Phone:
`)

const BULLETS = [
  'Unlimited dealer templates — a branded sticker for every store you serve',
  'No inventory feed needed — enter the VIN, print, done',
  'Professional EPA/DOT-style window stickers your dealers will love',
]

/**
 * "For Restylers & Upfitters" — audience section for restyler/upfitter shops
 * that install for multiple dealerships. The Restyler account is NOT
 * self-serve (it's set up by our team), so the CTA is a lead-generating
 * support inquiry — deliberately NOT the #signup trial form.
 */
export default function RestylerSection() {
  return (
    <section
      id="restylers"
      style={{
        background: '#f5f6f7',
        padding: '72px 24px',
        fontFamily: "'Roboto', sans-serif",
        borderTop: '1px solid #e0e0e0',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 40,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: copy + CTA */}
        <div style={{ flex: '1 1 460px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1976d2', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>
            For Restylers &amp; Upfitters
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#2a2b3c', margin: '0 0 12px' }}>
            One account for every store you serve
          </h2>
          <p style={{ fontSize: 16, color: '#55595c', lineHeight: 1.6, margin: '0 0 24px', maxWidth: 560 }}>
            If you restyle, upfit, or install for multiple dealerships, you shouldn&apos;t
            need a separate account for each. With a DealerAddendums Restyler account you
            create unlimited window-sticker templates — one for every store you service,
            each with their branding, products, and pricing — and print a professional,
            factory-style addendum in seconds.
          </p>
          <a
            href={INQUIRY_MAILTO}
            style={{
              display: 'inline-block',
              background: '#1976d2',
              color: '#ffffff',
              border: '1px solid #1976d2',
              height: 44,
              lineHeight: '44px',
              padding: '0 26px',
              borderRadius: 4,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Talk to us about a Restyler account
          </a>
          <p style={{ fontSize: 13, color: '#78828c', margin: '10px 0 0' }}>
            Restyler accounts are set up by our team — reach out and we&apos;ll get you going.
          </p>
        </div>

        {/* Right: what's included card */}
        <div
          style={{
            flex: '1 1 380px',
            maxWidth: 460,
            background: '#ffffff',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            padding: 28,
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            {BULLETS.map(item => (
              <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#4caf50', fontSize: 15, lineHeight: 1.5, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 14, color: '#55595c', lineHeight: 1.55 }}>{item}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderTop: '1px solid #e0e0e0', paddingTop: 14 }}>
              <span style={{ color: '#4caf50', fontSize: 15, lineHeight: 1.5, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 14, color: '#55595c', lineHeight: 1.55 }}>
                One simple plan: <strong style={{ color: '#2a2b3c' }}>$150/month or $2 per addendum, whichever is greater</strong> — pay
                for what you print, no per-store fees
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
