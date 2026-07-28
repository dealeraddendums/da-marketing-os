const APP_STORE_URL = 'https://apps.apple.com/us/app/dealeraddendums-5-0/id6788451484'

/**
 * "DealerAddendums for iPhone" — modest homepage section announcing the live
 * App Store build (DA Mobile v1.0.0, 2026-07). Badge asset per Apple's
 * marketing guidelines; QR is a static, pre-verified PNG of the same URL.
 */
export default function AppSection() {
  return (
    <section
      id="iphone-app"
      style={{
        background: '#f7f9fb',
        padding: '64px 24px',
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 32,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 420px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1976d2', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>
            New — on the App Store
          </p>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#2a2b3c', margin: '0 0 12px' }}>
            DealerAddendums for iPhone
          </h2>
          <p style={{ fontSize: 16, color: '#55595c', lineHeight: 1.6, margin: '0 0 20px', maxWidth: 520 }}>
            Print addendums from the lot with your iPhone — scan a VIN, build the addendum
            on the spot, and print it right there or queue it for your desk printer.
          </p>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/app-store-badge.svg" alt="Download on the App Store" style={{ height: 52, display: 'inline-block' }} />
          </a>
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/app-store-qr.png"
            alt="QR code linking to DealerAddendums 5.0 on the App Store"
            width={168}
            height={168}
            style={{ display: 'block', margin: '0 auto', border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}
          />
          <p style={{ fontSize: 13, color: '#78828c', margin: '8px 0 0' }}>Scan with your iPhone camera</p>
        </div>
      </div>
    </section>
  )
}
