import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dealeraddendums.com'

export const metadata: Metadata = {
  title: 'Privacy Policy | DealerAddendums',
  description: 'How DealerAddendums collects, uses, and protects your information.',
  alternates: { canonical: `${SITE_URL}/privacy` },
}

export default function PrivacyPage() {
  return <LegalPage file="privacy-policy.md" />
}
