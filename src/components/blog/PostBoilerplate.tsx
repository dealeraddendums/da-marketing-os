// The standard "About DealerAddendums" block appended to every blog post.
// One component, not pasted text, so the facts (dealer count, feature list)
// change in exactly one place. Dealer count 2,100+ confirmed by Allan
// 2026-11-09 and matches the live homepage.
export default function PostBoilerplate() {
  return (
    <aside
      aria-label="About DealerAddendums"
      style={{
        marginTop: 48,
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        background: '#f5f6f7',
        padding: '28px 32px',
      }}
    >
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#2a2b3c', margin: '0 0 12px' }}>
        About DealerAddendums
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#404347', margin: '0 0 12px' }}>
        <a href="/" style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 500 }}>DealerAddendums</a>{' '}
        is a subscription service for new and used vehicle dealers to create, manage, and print
        addendums, Buyers Guides, and info sheets. Set a product once with rules — make, model,
        trim, year, body style, mileage, fuel type — and it applies automatically to every
        matching vehicle. Month-to-month, no setup fees, US-based support, in business since
        2014, trusted by 2,100+ dealerships.
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#404347', margin: 0 }}>
        <a href="/#signup" style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 600 }}>
          Start a free trial at dealeraddendums.com →
        </a>
      </p>
    </aside>
  )
}
