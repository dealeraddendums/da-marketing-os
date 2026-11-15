import Image from 'next/image';
import Link from 'next/link';
import MobileNav from '../MobileNav';
import HeroAddendumRotator, { type HeroAddendumImage } from '../../shared/HeroAddendumRotator';

type HeroProps = { trialHref: string; headline: string; subhead: string; images: HeroAddendumImage[] };

// In-page anchors into Home B's own sections (the ZIP's original /product,
// /compliance, /how-it-works, /pricing routes don't exist on this site).
// #features is B's own Features section; #pricing is the live
// PricingSection's own id, rendered inside HomeB. Keep in sync with MobileNav.tsx.
const navigation = [
  { label: 'Product', href: '#platform' },
  { label: 'Features', href: '#features' },
  { label: 'Compliance', href: '#compliance' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
];

export default function Hero({ trialHref, headline, subhead, images }: HeroProps) {
  return (
    <section data-ab-section="hero" aria-labelledby="home-b-headline" className="relative isolate bg-[#0F2A52]">
      <header className="relative z-30 bg-white">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-10">
          <Link href="/" aria-label="DealerAddendums home" className="shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0F2A52]">
            {/* Real wordmark (1947×451 transparent, black text — only render on white/light backgrounds). 190×44 keeps its 4.32:1 ratio. */}
            <Image src="/home-b/dealeraddendums-logo.png" width={190} height={44} alt="DealerAddendums" className="h-auto w-[190px]" priority />
          </Link>
          <nav aria-label="Primary navigation" className="hidden items-center gap-6 lg:flex xl:gap-9">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm font-semibold text-[#0F2A52] transition-colors hover:text-[#C47A0D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0F2A52]">{item.label}</Link>
            ))}
          </nav>
          <Link href={trialHref} data-ab-cta="nav_trial" className="hidden shrink-0 rounded-md bg-[#F5A623] px-5 py-3 text-sm font-bold text-[#0F2A52] transition-colors hover:bg-[#e99512] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0F2A52] lg:inline-flex">Start Free Trial</Link>
          <MobileNav trialHref={trialHref} />
        </div>
      </header>

      <div className="absolute inset-x-0 bottom-0 top-20 -z-10 overflow-hidden">
        {/* Real photo (5000×2812, 16:9). fill mode sizes from the container, so no width/height props and no layout shift. */}
        <Image src="/home-b/hero-dealership.jpg" alt="Modern blue SUV outside a contemporary dealership" fill priority sizes="100vw" className="object-cover object-right" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#071B36]/95 via-[#0F2A52]/85 to-[#0F2A52]/20 lg:via-[#0F2A52]/70" />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-5 pb-24 pt-14 sm:px-8 sm:pt-20 lg:min-h-[670px] lg:grid-cols-12 lg:gap-10 lg:px-10 lg:pb-28 lg:pt-16">
        <div className="relative z-10 lg:col-span-7">
          <h1 id="home-b-headline" className="max-w-3xl text-balance text-4xl font-black italic leading-[1.04] tracking-tight text-white sm:text-5xl md:text-6xl xl:text-7xl">{headline}</h1>
          <p className="mt-7 max-w-xl text-lg font-medium leading-relaxed text-white sm:text-xl">{subhead}</p>
          <Link href={trialHref} data-ab-cta="hero_primary" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-md bg-[#F5A623] px-6 py-3 text-center text-base font-extrabold text-[#0F2A52] shadow-lg transition-colors hover:bg-[#e99512] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start Your Free 30-Day Trial <span aria-hidden="true" className="ml-2">→</span></Link>
          <ul aria-label="Trial benefits" className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-white">
            {['Full-Featured', 'No Setup Required', 'No Contract'].map((item) => (
              <li key={item} className="flex items-center gap-2"><span aria-hidden="true" className="font-black text-[#F5A623]">✓</span>{item}</li>
            ))}
          </ul>
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[310px] sm:max-w-[350px] lg:col-span-5 lg:max-w-[380px] lg:justify-self-end">
          {/* Same four addendums, same order as the A hero's rotator; the tilt,
              shadow and white frame stay on this wrapper, unchanged. */}
          <div className="-rotate-2 rounded-xl bg-white p-2 shadow-2xl ring-1 ring-white/40">
            <HeroAddendumRotator images={images} sizes="(max-width: 640px) 310px, (max-width: 1023px) 350px, 380px" />
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 bg-white [clip-path:polygon(0_80%,100%_0,100%_100%,0_100%)] sm:h-20" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-9 left-0 h-2 w-2/5 -rotate-3 bg-[#F5A623] sm:bottom-12" />
    </section>
  );
}
