import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'
import { CTX_HEADERS, buildSignals, type Device } from '@/lib/context-key'
import { resolveHero, type HeroTracking } from '@/lib/hero-engine'
import { getHeroAddendumImages } from '@/lib/hero-slides'
import type { PersonalizationContext } from '@/lib/personalization'
import HeroSection, { type WarmPayload } from '@/components/marketing/HeroSection'
import FeaturesSection from '@/components/marketing/FeaturesSection'
import ProductTypesSection from '@/components/marketing/ProductTypesSection'
import PricingSection from '@/components/marketing/PricingSection'
import TestimonialsSection from '@/components/marketing/TestimonialsSection'
import CTASection from '@/components/marketing/CTASection'
import AppSection from '@/components/marketing/AppSection'
import RestylerSection from '@/components/marketing/RestylerSection'
import LayoutA from '@/components/marketing/LayoutA'
import SiteJsonLd from '@/components/marketing/SiteJsonLd'
import AbAssignmentTracker from '@/components/marketing/AbAssignmentTracker'
import HomeB from '@/components/home-b/HomeB'
import { AB_HOME_HEADER, AB_HOME_NEW_HEADER, incrementAbHomeStat, parseBucket } from '@/lib/ab-home'
import { parseHeroVariant, HERO_CONTROL } from '@/lib/ab-variants'
import { getFooterPosts } from '@/lib/blog'

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

  // Hero rotator cards for BOTH variants — admin-managed (hero_slides table),
  // cached 60s, falls back to the hardcoded four on empty/error.
  const heroImages = await getHeroAddendumImages()

  // ── Home B layout test ──────────────────────────────────────────────────────
  // Bucket decided in middleware (cookie da_ab_home → x-ab-home request
  // header); default A covers any render that skipped middleware. The page is
  // already force-dynamic, so each request renders its own variant — nothing
  // here changes A's caching behavior.
  const abHome = parseBucket(h.get(AB_HOME_HEADER)) ?? 'A'
  if (h.get(AB_HOME_NEW_HEADER) === '1') {
    // Raw assignment counter — every bucket minted at the middleware,
    // including crawlers that slip the UA gate. The "visitors" metric is NOT
    // counted here any more: it comes from the client-side beacon
    // (/api/ab/seen, fired by AbAssignmentTracker), which a no-JS crawler
    // never reaches. visitors ÷ assigned_raw = the human share.
    void incrementAbHomeStat(abHome, 'assigned_raw')
  }

  if (abHome === 'B') {
    // Variant B: the Home B redesign, followed by the EXISTING CTASection — it
    // carries the id="signup" trial form (every Home B CTA points at #signup)
    // and the site footer, so the conversion instrument and the legal links
    // are identical across variants. The hero personalization engine
    // (resolveHero) deliberately does not run for B.
    const homeBTracking: HeroTracking = {
      contextKey: 'home-b',
      variationId: 'home-b',
      heroSource: 'static-default',
      keyword: '',
      dealerType: 'unknown',
      abVariant: 'home-b', // keeps B's leads out of the hero copy test arms
      layoutVariant: 'home-b',
      headline: 'Create · Manage · Print Addendums. Compliant by Design.',
    }
    // Partner-group logos for the TrustedBy band. All six are pre-normalized
    // 400×160 transparent PNGs (content trimmed + fitted so visual weight
    // matches across the set).
    const homeBLogos = [
      { name: 'Lithia Motors', src: '/home-b/logos/lithia.png', width: 400, height: 160 },
      { name: 'AutoNation', src: '/home-b/logos/autonation.png', width: 400, height: 160 },
      { name: 'Penske Automotive', src: '/home-b/logos/penske-automotive.png', width: 400, height: 160 },
      { name: 'Group 1 Automotive', src: '/home-b/logos/group-1-automotive.png', width: 400, height: 160 },
      { name: 'Asbury Automotive Group', src: '/home-b/logos/asbury-automotive-group.png', width: 400, height: 160 },
      { name: 'Sonic Automotive', src: '/home-b/logos/sonic-automotive.png', width: 400, height: 160 },
    ]
    return (
      <>
        <SiteJsonLd />
        <AbAssignmentTracker bucket="B" />
        <HomeB trialHref="#signup" dealerCount="1,600+" logos={homeBLogos} tracking={homeBTracking} heroImages={heroImages} />
        <CTASection tracking={homeBTracking} resources={await getFooterPosts()} />
      </>
    )
  }

  // Cookie is attacker-controlled: unknown values fall back to control
  // (mirrors middleware); a missing cookie keeps the legacy default.
  const abCookieRaw   = cookieStore.get('da_hero_ab')?.value
  const abVariant     = parseHeroVariant(abCookieRaw) ?? (abCookieRaw ? HERO_CONTROL : 'personalized')
  // Layout test retired 2026-06-12 — everyone gets the new hero regardless of
  // stale da_layout cookies. LayoutA stays in the repo for a future
  // strong-vs-strong test; to re-enable, read the cookie here again.
  const layoutVariant: string = 'b'

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
        <SiteJsonLd />
        <AbAssignmentTracker bucket="A" />
        <Suspense fallback={<HeroSkeleton />}>
          <LayoutA personalization={ctx} />
        </Suspense>
      </main>
    )
  }

  // Layout B — new design
  return (
    <main>
      <SiteJsonLd />
      <AbAssignmentTracker bucket="A" />
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection hero={resolved.hero} tracking={tracking} warm={warm} images={heroImages} />
      </Suspense>
      <ProductTypesSection />
      <FeaturesSection />
      <AppSection />
      <PricingSection tracking={tracking} />
      <TestimonialsSection dealerType={ctx.dealerType} />
      <RestylerSection />
      <CTASection tracking={tracking} resources={await getFooterPosts()} />
    </main>
  )
}
