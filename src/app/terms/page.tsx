import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'

export const metadata: Metadata = {
  title: 'Terms of Use | DealerAddendums',
  description: 'The terms governing use of the DealerAddendums platform.',
  alternates: { canonical: `${SITE_URL}/terms` },
}

export default function TermsPage() {
  return <LegalPage file="terms-of-use.md" title="Terms of Use" />
}
