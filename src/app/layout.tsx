import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import './globals.css'
import PostHogProvider from '@/components/PostHogProvider'

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'DealerAddendums — Vehicle Addendum Software for Car Dealers',
  description: 'Print customized vehicle addendums, buyers guides, and info sheets in seconds. Used by 1,644+ dealerships since 2014. Month-to-month, no contracts.',
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
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
