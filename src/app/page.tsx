import { cookies } from 'next/headers'
import { Suspense } from 'react'
import {
  STATIC_TERM_MAP,
  DEALERTYPE_COPY,
  GENERIC_COPY,
  detectDealerType,
  type PersonalizationContext,
  type PersonalizationVariant,
} from '@/lib/personalization'
import HeroSection from '@/components/marketing/HeroSection'
import FeaturesSection from '@/components/marketing/FeaturesSection'
import PricingSection from '@/components/marketing/PricingSection'
import TestimonialsSection from '@/components/marketing/TestimonialsSection'
import CTASection from '@/components/marketing/CTASection'
import LayoutA from '@/components/marketing/LayoutA'

function HeroSkeleton() {
  return (
    <div style={{ background: '#2a2b3c', minHeight: 532 }} aria-hidden="true" />
  )
}

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>
}

function getString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] || ''
  return v || ''
}

function resolveVariant(
  abVariant: string,
  utmTerm: string,
  dealerType: string
): { variant: PersonalizationVariant | null; needsAI: boolean } {
  const normalizedTerm = utmTerm.toLowerCase().trim()

  if (abVariant === 'generic') {
    return { variant: GENERIC_COPY, needsAI: false }
  }

  if (abVariant === 'dealertype') {
    const typeVariant = DEALERTYPE_COPY[dealerType] || DEALERTYPE_COPY['general']
    return { variant: typeVariant, needsAI: false }
  }

  // Default: 'personalized'
  const staticVariant = normalizedTerm ? STATIC_TERM_MAP[normalizedTerm] || null : null
  const needsAI = !staticVariant && !!normalizedTerm
  return { variant: staticVariant, needsAI }
}

export default async function HomePage({ searchParams }: PageProps) {
  const utmTerm     = getString(searchParams.utm_term)
  const utmCampaign = getString(searchParams.utm_campaign)
  const utmSource   = getString(searchParams.utm_source)

  const cookieStore   = cookies()
  const abVariant     = cookieStore.get('da_hero_ab')?.value   || 'personalized'
  const layoutVariant = cookieStore.get('da_layout')?.value    || 'b'
  const dealerType    = detectDealerType(utmTerm + ' ' + utmCampaign)

  const { variant, needsAI } = resolveVariant(abVariant, utmTerm, dealerType)

  const ctx: PersonalizationContext = {
    abVariant,
    layoutVariant,
    utmTerm,
    utmCampaign,
    dealerType,
    staticMatch: !!variant && !needsAI,
    needsAI,
    headline:    variant?.headline    || null,
    subheadline: variant?.subheadline || null,
    cta:         variant?.cta         || null,
    socialProof: variant?.socialProof || null,
  }

  // Layout A — classic style (mirrors current dealeraddendums.com)
  if (layoutVariant === 'a') {
    return (
      <main>
        <Suspense fallback={<HeroSkeleton />}>
          <LayoutA personalization={ctx} />
        </Suspense>
      </main>
    )
  }

  // Layout B — new design
  return (
    <main>
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection personalization={ctx} />
      </Suspense>
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection dealerType={ctx.dealerType} />
      <CTASection />
    </main>
  )
}
