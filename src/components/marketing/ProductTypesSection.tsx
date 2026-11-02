const CARDS = [
  {
    label: 'Required (Fixed) Products',
    accent: '#ffa500',
    body: 'Already on the vehicle or required with every sale: documentation fees, electronic filing fees, window tint, spray-in bedliners, lift kits, pre-delivery service charges. These are added to MSRP and the addendum shows the resulting price of the vehicle as equipped — so the buyer sees the real number, not a surprise in the finance office.',
  },
  {
    label: 'Suggested Products',
    accent: '#1976d2',
    body: 'Offered, not required: protection packages, appearance and dent-and-ding protection, insurance and service products. The addendum presents them in their own clearly labeled section with their own pricing, so the buyer knows they can say no.',
  },
]

const POINTS = [
  {
    title: 'Combo template',
    desc: 'One addendum visually separates the two product types — each section with its own distinct, clearly labeled total.',
  },
  {
    title: 'Rules-based products',
    desc: 'Rules put the right fees and products on the right units automatically — new inventory is addended the moment it lands.',
  },
  {
    title: 'Group-standardized disclosures',
    desc: 'Standardized legal language and disclaimers appear on every store’s addendum, consistent across the whole group.',
  },
  {
    title: 'Magic Button on the VDP',
    desc: 'The Magic Button shows the same PDF on your vehicle detail pages — the website and the windshield match.',
  },
]

export default function ProductTypesSection() {
  return (
    <section
      style={{
        background: '#ffffff',
        padding: '64px 24px',
        fontFamily: "'Roboto', sans-serif",
        borderBottom: '1px solid #e0e0e0',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#2a2b3c',
            margin: '0 0 12px',
          }}>
            Two kinds of products. One honest price.
          </h2>
          <p style={{
            fontSize: 16,
            color: '#55595c',
            maxWidth: 560,
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            Every dealer add-on is one of two things — and your addendum should
            never leave the buyer guessing which.
          </p>
        </div>

        <div className="product-types-grid">
          {CARDS.map(card => (
            <div
              key={card.label}
              style={{
                background: '#ffffff',
                border: '1px solid #e0e0e0',
                borderTop: `3px solid ${card.accent}`,
                borderRadius: 6,
                padding: 28,
              }}
            >
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: card.accent === '#ffa500' ? '#9a6400' : card.accent,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}>
                {card.label}
              </div>
              <p style={{
                fontSize: 15,
                color: '#333333',
                lineHeight: 1.7,
                margin: 0,
              }}>
                {card.body}
              </p>
            </div>
          ))}
        </div>

        <p style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#6b7280',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          textAlign: 'center',
          margin: '44px 0 20px',
        }}>
          How DealerAddendums handles it
        </p>

        <div className="product-points-grid">
          {POINTS.map(point => (
            <div key={point.title} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 15, lineHeight: 1.5 }}>✓</span>
              <div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#333333',
                  marginBottom: 4,
                }}>
                  {point.title}
                </div>
                <p style={{
                  fontSize: 13,
                  color: '#55595c',
                  lineHeight: 1.6,
                  margin: 0,
                }}>
                  {point.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <a
            href="#gallery"
            style={{
              display: 'inline-block',
              background: '#1976d2',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 600,
              padding: '12px 28px',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            See a Combo Addendum
          </a>
        </div>
      </div>
    </section>
  )
}
