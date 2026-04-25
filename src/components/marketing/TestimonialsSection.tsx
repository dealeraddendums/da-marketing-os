const TESTIMONIALS = [
  {
    quote: "Ok, we're signed up. Placed order for labels as well. Try to hurry those over! You win, your product rocks — super easy to use and intuitive.",
    name: 'Jason Falbo',
    title: '',
    dealership: 'Finnegan CDJR',
    type: 'franchise',
  },
  {
    quote: "Hi Allan, thank you so very much for creating this website, I absolutely love it and using it — it makes my job a whole lot easier!",
    name: 'Christine',
    title: '',
    dealership: 'Townsend Honda',
    type: 'franchise',
  },
  {
    quote: "Dealer Addendums has truly made our addendum process so much easier! The efficiency and quick response from Allan is outstanding! Here at Crown BMW we give Dealer Addendums two thumbs up.",
    name: 'Yazmin Garcia',
    title: '',
    dealership: 'Crown BMW',
    type: 'franchise',
  },
  {
    quote: "We got tired of wrestling with Reynolds' antiquated addendum system. Now we have 8 rooftops using DealerAddendums. It couldn't be easier to use, or an easier decision to make!",
    name: 'Phillip Taylor',
    title: '',
    dealership: 'Stevenson Automotive Group',
    type: 'franchise',
  },
  {
    quote: "DealerAddendums makes addendums quick and easy for my entire inventory. Customer service is outstanding and always helpful.",
    name: 'Ian Weir',
    title: '',
    dealership: 'Richmond BMW',
    type: 'franchise',
  },
  {
    quote: "Great service, great pricing, and anytime I need help, I am given remote support right away! Fantastic service!!",
    name: 'Amy',
    title: '',
    dealership: 'Spradley Kia Mazda',
    type: 'independent',
  },
]

interface Props {
  dealerType?: string
}

export default function TestimonialsSection({ dealerType = 'general' }: Props) {
  const sorted = [...TESTIMONIALS].sort((a, b) => {
    if (a.type === dealerType) return -1
    if (b.type === dealerType) return 1
    return 0
  })
  const displayed = sorted.slice(0, 3)

  return (
    <section
      id="testimonials"
      style={{
        background: '#ffffff',
        padding: '72px 24px',
        fontFamily: "'Roboto', sans-serif",
        borderTop: '1px solid #e0e0e0',
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
            Dealers Love DealerAddendums
          </h2>
          <p style={{
            fontSize: 16,
            color: '#55595c',
            margin: 0,
          }}>
            Trusted by franchise groups, independents, and everyone in between since 2014.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
        }}>
          {displayed.map((t, i) => (
            <div
              key={i}
              style={{
                background: '#ffffff',
                border: '1px solid #e0e0e0',
                borderRadius: 6,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{
                fontSize: 14,
                color: '#ffa500',
                marginBottom: 14,
                letterSpacing: 2,
              }}>
                ★★★★★
              </div>

              <p style={{
                fontSize: 14,
                color: '#333333',
                lineHeight: 1.7,
                margin: '0 0 20px',
                flex: 1,
              }}>
                "{t.quote}"
              </p>

              <div style={{
                borderTop: '1px solid #e0e0e0',
                paddingTop: 16,
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#333333',
                  marginBottom: 2,
                }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 13, color: '#78828c' }}>{t.dealership}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div style={{
          marginTop: 48,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 20,
          borderTop: '1px solid #e0e0e0',
          paddingTop: 36,
          textAlign: 'center',
        }}>
          {[
            { value: '1,644', label: 'Active Dealerships' },
            { value: '2,347,023', label: 'Addendums Printed' },
            { value: '$993M+', label: 'Addendum Value Tracked' },
            { value: '32,000+', label: 'Platform Updates' },
          ].map(s => (
            <div key={s.label}>
              <div style={{
                fontSize: 26,
                fontWeight: 700,
                color: '#1976d2',
                lineHeight: 1,
                marginBottom: 6,
              }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: '#78828c', fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
