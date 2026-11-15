import type { HeroTracking } from '@/lib/hero-engine';
import type { HeroAddendumImage } from '@/lib/hero-addendum-images';
import PricingSection from '../marketing/PricingSection';
import Hero from './sections/Hero';
import ValueProps from './sections/ValueProps';
import Features from './sections/Features';
import PlatformShowcase from './sections/PlatformShowcase';
import TrustedBy from './sections/TrustedBy';
import FinalCta from './sections/FinalCta';

export type HomeBLogo = {
  name: string;
  src: string;
  width: number;
  height: number;
};

export type HomeBProps = {
  trialHref: string;
  dealerCount: string;
  headline?: string;
  subhead?: string;
  logos: HomeBLogo[];
  tracking?: HeroTracking;
  /** Hero rotator cards (admin-managed hero_slides, server-fetched with fallback). */
  heroImages: HeroAddendumImage[];
};

export default function HomeB({
  trialHref,
  dealerCount,
  headline = 'Create · Manage · Print Addendums. Compliant by Design.',
  subhead = 'Beautiful vehicle addendums. Built-in compliance. Ready in seconds.',
  logos,
  tracking,
  heroImages,
}: HomeBProps) {
  return (
    <main className="w-full overflow-x-clip bg-white font-sans text-[#0F2A52]">
      <Hero trialHref={trialHref} headline={headline} subhead={subhead} images={heroImages} />
      <ValueProps />
      <Features />
      <PlatformShowcase />
      {/* The live homepage's PricingSection, unchanged (it carries its own
          #pricing anchor); the wrapper only adds B's data-ab-section marker
          without touching the shared component. */}
      <div data-ab-section="pricing">
        <PricingSection tracking={tracking} />
      </div>
      <TrustedBy dealerCount={dealerCount} logos={logos} />
      <FinalCta trialHref={trialHref} />
    </main>
  );
}
