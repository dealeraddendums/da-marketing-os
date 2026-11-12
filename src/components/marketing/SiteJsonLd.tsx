// Organization + SoftwareApplication JSON-LD for the homepage.
//
// A server component rendered from app/page.tsx, so the structured data is in
// the INITIAL HTML (AI crawlers and Google's first-pass parser both read the
// served document; client-injected scripts are invisible to anything that
// doesn't execute JS). Report-only readiness check in the AI Visibility tab
// flagged the absence; approved as a fix 2026-11-12.
//
// Deliberately NO prices anywhere — DA-Billing owns pricing; the offer points
// at the pricing section instead.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com'

const TAGLINE = 'Create · Manage · Print Addendums. Compliant by Design.'

/**
 * Official social profiles for Organization.sameAs. ⚠️ Intentionally empty:
 * no verifiable DealerAddendums social profile URLs exist in this repo or in
 * public search, and a wrong sameAs actively confuses entity resolution.
 * Allan: paste the real profile URLs here (LinkedIn/Facebook/X/YouTube) and
 * redeploy — nothing else needs to change.
 */
const SOCIAL_PROFILES: string[] = []

const organization = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'DealerAddendums',
  url: `${SITE}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE}/images/da-mark.png`,
    width: 214,
    height: 214,
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    telephone: '+1-801-415-9435',
    email: 'support@dealeraddendums.com',
    availableLanguage: ['English', 'Spanish'],
  },
  ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
}

const softwareApplication = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE}/#software`,
  name: 'DealerAddendums',
  description: TAGLINE,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: `${SITE}/`,
  offers: {
    '@type': 'Offer',
    url: `${SITE}/#pricing`,
    description:
      'Month-to-month subscription with a free trial — current plans on the pricing section.',
  },
  publisher: { '@id': `${SITE}/#organization` },
}

const graph = {
  '@context': 'https://schema.org',
  '@graph': [organization, softwareApplication],
}

export default function SiteJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
