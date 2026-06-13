import Image from 'next/image'

const FEATURES = [
  {
    icon: '📄',
    title: 'Vehicle Addendums',
    desc: 'Print professional, branded addendums in seconds. With automatic inventory and rules-based products, addendums build themselves — virtually eliminating manual-entry error.',
  },
  {
    icon: '🔄',
    title: 'Automatic Inventory — Any Provider',
    desc: 'Inventory flows in automatically from any website provider, syndication company, or DMS — your lot syncs itself, no manual VIN entry. Addendum data feeds back out, too.',
  },
  {
    icon: '⚙️',
    title: 'Rules-Based Products',
    desc: 'Set a product once with rules — make, model, trim, year, body style, mileage, fuel type — and it auto-applies to every matching vehicle. New inventory is addended automatically.',
  },
  {
    icon: '⚖️',
    title: 'FTC Buyers Guides',
    desc: 'As-Is, Implied, or Warranty Buyers Guides in English and Spanish — printed in seconds with a single click. FTC-compliant templates built in.',
  },
  {
    icon: '🪄',
    title: 'Magic Button',
    desc: 'Embed a one-click Magic Button on your VDP that shows shoppers the exact PDF addendum from the lot — your online listing carries the same disclosures as the printed sticker.',
  },
  {
    icon: '🧾',
    title: 'Combo Addendum',
    desc: 'One addendum that clearly separates Required add-ons from Suggested (optional) ones — buyers see what’s mandatory vs optional at a glance.',
  },
  {
    icon: '🏷️',
    title: 'CPO Info Sheets',
    desc: 'Pre-Owned and CPO Vehicle Information Sheets with your logo, vehicle details, description, options, QR code, and optional price.',
  },
  {
    icon: '📱',
    title: 'iOS Mobile App — Included',
    desc: 'The DA Installer app lets your team scan VINs, QR codes, or barcodes remotely, then create, manage, and print addendums right from the lot. Included with every plan.',
  },
  {
    icon: '🤖',
    title: 'AI Vehicle Descriptions',
    desc: 'Tired of writing SEO-compliant vehicle descriptions? Our AI CarDescriptions tool generates them automatically for every unit on your lot.',
  },
  {
    icon: '🎨',
    title: 'Color-Matched Vehicle Images',
    desc: 'Show a stock photo matched to each vehicle’s actual color right on the addendum. ($50/mo add-on)',
  },
  {
    icon: '🏢',
    title: 'Multi-Rooftop Groups',
    desc: 'Manage all your locations from one account. Group discounts and consistent branding across every store in your dealer group.',
  },
  {
    icon: '🖌️',
    title: 'Custom Branding',
    desc: 'Your dealership logo, pricing, and watermarks on every document. Hard vs. soft add templates available. Look as professional as the largest franchise groups.',
  },
]

const DEALER_GROUPS = [
  'Lithia Motors',
  'Larry H. Miller Automotive',
  'Asbury Automotive Group',
  'Sonic Automotive',
  'Berkshire Hathaway Automotive',
  'Ken Garff Automotive Group',
]

const ADDENDUM_IMAGES = [
  'https://www.dealeraddendums.com/hubfs/da-migrate%20files%20assets/images/img_1.jpg',
  'https://www.dealeraddendums.com/hubfs/da-migrate%20files%20assets/images/img_2.jpg',
  'https://www.dealeraddendums.com/hubfs/da-migrate%20files%20assets/images/img_3.jpg',
  'https://www.dealeraddendums.com/hubfs/da-migrate%20files%20assets/images/img_4.jpg',
]

export default function FeaturesSection() {
  return (
    <>
      <section
        id="features"
        style={{
          background: '#ffffff',
          padding: '72px 24px',
          fontFamily: "'Roboto', sans-serif",
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
              Everything Your Dealership Needs
            </h2>
            <p style={{
              fontSize: 16,
              color: '#55595c',
              maxWidth: 520,
              margin: '0 auto',
              lineHeight: 1.6,
            }}>
              From automatic inventory to one-click printing — DealerAddendums
              handles the paperwork so your team can focus on selling.
            </p>
          </div>

          <div className="features-grid">
            {FEATURES.map(f => (
              <div
                key={f.title}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e0e0e0',
                  borderRadius: 6,
                  padding: 24,
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 12, lineHeight: 1 }}>
                  {f.icon}
                </div>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#333333',
                  marginBottom: 8,
                }}>
                  {f.title}
                </div>
                <p style={{
                  fontSize: 14,
                  color: '#55595c',
                  lineHeight: 1.6,
                  margin: 0,
                }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Addendum Examples ───────────────────────────────── */}
      <section style={{
        background: '#f5f6f7',
        padding: '56px 24px',
        fontFamily: "'Roboto', sans-serif",
        borderTop: '1px solid #e0e0e0',
        borderBottom: '1px solid #e0e0e0',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h3 style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#2a2b3c',
              margin: '0 0 10px',
            }}>
              See What Your Addendums Will Look Like
            </h3>
            <p style={{ fontSize: 15, color: '#55595c', margin: 0 }}>
              Professional, branded documents — printed in under 30 seconds.
            </p>
          </div>
          <div className="addendum-img-grid">
            {ADDENDUM_IMAGES.map((src, i) => (
              <div
                key={i}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#ffffff',
                }}
              >
                <Image
                  src={src}
                  alt={`Addendum example ${i + 1}`}
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

      {/* ── Dealer Groups ───────────────────────────────────── */}
      <section style={{
        background: '#ffffff',
        padding: '40px 24px',
        fontFamily: "'Roboto', sans-serif",
        borderBottom: '1px solid #e0e0e0',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <p style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#78828c',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 20,
          }}>
            Trusted by Leading Dealer Groups
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '12px 32px',
          }}>
            {DEALER_GROUPS.map(name => (
              <span
                key={name}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#55595c',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
