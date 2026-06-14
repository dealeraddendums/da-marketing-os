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
  title: 'DealerAddendums — Vehicle Addendum Software for Car Dealers',
  description: 'Print customized vehicle addendums, buyers guides, and info sheets in seconds. Used by 1,600+ dealerships since 2014. Month-to-month, no contracts.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'),
  openGraph: {
    title: 'DealerAddendums — The #1 Addendum Platform for Car Dealers',
    description: 'Stop printing addendums by hand. 1,600+ dealers automate it with DealerAddendums.',
    url: 'https://dealeraddendums.com',
    siteName: 'DealerAddendums',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DealerAddendums — The #1 Addendum Platform for Car Dealers',
    description: 'Stop printing addendums by hand. 1,600+ dealers automate it.',
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
