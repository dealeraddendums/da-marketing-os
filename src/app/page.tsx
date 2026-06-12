import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'
import { CTX_HEADERS, buildSignals, type Device } from '@/lib/context-key'
import { resolveHero, type HeroTracking } from '@/lib/hero-engine'
import type { PersonalizationContext } from '@/lib/personalization'
import HeroSection, { type WarmPayload } from '@/components/marketing/HeroSection'
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

export default async function HomePage({ searchParams }: PageProps) {
  const h = headers()
  const cookieStore = cookies()
  const abVariant     = cookieStore.get('da_hero_ab')?.value || 'personalized'
  const layoutVariant = cookieStore.get('da_layout')?.value  || 'b'

  // Signals from middleware request headers; falls back to deriving them
  // inline (e.g. direct render without middleware).
  const utmCampaign = h.get(CTX_HEADERS.campaign) ?? getString(searchParams.utm_campaign)
  const keyword =
    h.get(CTX_HEADERS.keyword) ??
    (getString(searchParams.utm_term) || getString(searchParams.keyword) || getString(searchParams.kw))
  const derived = buildSignals({
    keyword,
    utmCampaign,
    userAgent: h.get('user-agent') || '',
    returning: h.get(CTX_HEADERS.returning) === '1',
  })
  const signals = {
    ...derived,
    keywordCluster: h.get(CTX_HEADERS.cluster) ?? derived.keywordCluster,
    dealerType: h.get(CTX_HEADERS.dealerType) ?? derived.dealerType,
    device: (h.get(CTX_HEADERS.device) as Device) ?? derived.device,
    contextKey: h.get(CTX_HEADERS.contextKey) ?? derived.contextKey,
  }

  const resolved = await resolveHero(signals, abVariant)

  const tracking: HeroTracking = {
    contextKey: signals.contextKey,
    variationId: resolved.variationId,
    heroSource: resolved.source,
    keyword: signals.keyword,
    dealerType: signals.dealerType,
    abVariant,
    layoutVariant,
    headline: resolved.hero.headline,
  }

  const warm: WarmPayload | null = resolved.needsWarm
    ? { keyword: signals.keyword, utmCampaign: signals.utmCampaign, returning: signals.returning }
    : null

  const ctx: PersonalizationContext = {
    abVariant,
    layoutVariant,
    utmTerm: signals.keyword,
    utmCampaign: signals.utmCampaign,
    dealerType: signals.dealerType,
    staticMatch: resolved.source === 'static-term',
    needsAI: false, // generation is out-of-band now; the page never waits on AI
    headline:    resolved.hero.headline,
    subheadline: resolved.hero.subheadline,
    cta:         resolved.hero.ctaText,
    socialProof: resolved.hero.proofLine,
    contextKey:  signals.contextKey,
    variationId: resolved.variationId,
    keyword:     signals.keyword,
    device:      signals.device,
    returning:   signals.returning,
    heroSource:  resolved.source,
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
        <HeroSection hero={resolved.hero} tracking={tracking} warm={warm} />
      </Suspense>
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection dealerType={ctx.dealerType} />
      <CTASection tracking={tracking} />
    </main>
  )
}
