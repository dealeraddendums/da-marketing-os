import Image from 'next/image'

const FEATURES = [
  {
    icon: '🧾',
    title: 'Required + Suggested Addendums',
    desc: 'One addendum, two clearly labeled sections — buyers see what’s part of the price and what’s optional at a glance.',
  },
  {
    icon: '⚖️',
    title: 'FTC Buyers Guides',
    desc: 'As-Is, Implied, or Warranty Buyers Guides in English and Spanish — printed in seconds with a single click. Official form layouts built in.',
  },
  {
    icon: '🪄',
    title: 'Magic Button',
    desc: 'Embed a one-click Magic Button on your VDP that shows shoppers the exact PDF addendum from the lot — your online listing carries the same disclosures as the printed sticker.',
  },
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
    icon: '🏷️',
    title: 'CPO Info Sheets',
    desc: 'Pre-Owned and CPO Vehicle Information Sheets with your logo, vehicle details, description, options, QR code, and optional price.',
  },
  {
    icon: '📱',
    title: 'iPhone App — Included',
    desc: 'DealerAddendums 5.0 for iPhone is on the App Store: scan VINs, QR codes, or barcodes on the lot, build the addendum on the spot, and AirPrint it or queue it for your desk printer. Included with every plan.',
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
]

const DEALER_GROUPS = [
  'Lithia Motors',
  'Larry H. Miller Automotive',
  'Asbury Automotive Group',
  'Sonic Automotive',
  'Berkshire Hathaway Automotive',
  'Ken Garff Automotive Group',
]

// All served locally — the old HubSpot-hosted /hubfs/ URLs 404 now that
// www points at this app.
const ADDENDUM_IMAGES = [
  {
    src: '/images/addendum-required.webp',
    width: 760,
    height: 1968,
    alt: 'Addendum with required fixed products added to MSRP and a price with fees and additions total',
    caption: 'Required (fixed) products — added to MSRP',
  },
  {
    src: '/images/addendum-suggested.webp',
    width: 760,
    height: 1968,
    alt: 'Addendum with a suggested dealer-installed package shown as clearly optional on top of MSRP',
    caption: 'Suggested products — optional, not required',
  },
  {
    src: '/images/addendum-example-honda.jpg',
    width: 320,
    height: 819,
    alt: 'Branded Honda addendum with itemized dealer-installed options and total price',
    caption: 'Dealer-installed options, itemized with total',
  },
  {
    src: '/images/addendum-example-vw.jpg',
    width: 320,
    height: 819,
    alt: 'Addendum with fuel economy panel and itemized dealer-installed options',
    caption: 'Fuel economy panel + itemized options',
  },
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
      <section id="gallery" style={{
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
              Printed in under 30 seconds — every one of them with a clear line
              between required and optional.
            </p>
          </div>
          <div className="addendum-img-grid">
            {ADDENDUM_IMAGES.map(img => (
              <figure
                key={img.src}
                style={{ margin: 0 }}
              >
                <div style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#ffffff',
                }}>
                  <Image
                    src={img.src}
                    alt={img.alt}
                    width={img.width}
                    height={img.height}
                    sizes="(max-width: 768px) 45vw, 260px"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                    loading="lazy"
                  />
                </div>
                <figcaption style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#55595c',
                  textAlign: 'center',
                  marginTop: 8,
                  lineHeight: 1.4,
                }}>
                  {img.caption}
                </figcaption>
              </figure>
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
