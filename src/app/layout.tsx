import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import './globals.css'
import PostHogProvider from '@/components/PostHogProvider'
import ChatWidgetMount from '@/components/marketing/ChatWidgetMount'

// Google Tag Manager — env-gated, inert when NEXT_PUBLIC_GTM_ID is unset. The
// container owns GA4 + the Google Ads conversion (nothing hardcoded here). The
// signup form success handlers push a `sign_up` event into the dataLayer for
// the container to route (see lib/attribution.ts → pushSignupEvent).
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'DealerAddendums — Create · Manage · Print Addendums. Compliant by Design.',
  description: "One addendum that shows the buyer what's in the price and what's optional — required products added to MSRP, suggested products clearly marked, printed from your inventory in seconds. FTC Buyers Guides in English & Spanish. 2,100+ dealerships.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'),
  openGraph: {
    title: 'DealerAddendums — Create · Manage · Print Addendums. Compliant by Design.',
    description: "One addendum that shows the buyer what's in the price and what's optional — required products added to MSRP, suggested products clearly marked, printed from your inventory in seconds. FTC Buyers Guides in English & Spanish. 2,100+ dealerships.",
    url: 'https://dealeraddendums.com',
    siteName: 'DealerAddendums',
    type: 'website',
    images: [{ url: '/images/og-home.png', width: 1200, height: 630, alt: 'Two DealerAddendums vehicle addendums — required products added to MSRP, suggested products clearly optional' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DealerAddendums — Create · Manage · Print Addendums. Compliant by Design.',
    description: "One addendum that shows the buyer what's in the price and what's optional — required products added to MSRP, suggested products clearly marked. FTC Buyers Guides in English & Spanish. 2,100+ dealerships.",
    images: ['/images/og-home.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.className}>
      {GTM_ID && (
        <head>
          {/* Google Tag Manager — container snippet, as high in <head> as possible */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        </head>
      )}
      <body>
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
        <PostHogProvider>{children}</PostHogProvider>
        <ChatWidgetMount />
      </body>
    </html>
  )
}
