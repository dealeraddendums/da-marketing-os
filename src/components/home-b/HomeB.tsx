import Hero from './sections/Hero';
import ValueProps from './sections/ValueProps';
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
};

export default function HomeB({
  trialHref,
  dealerCount,
  headline = 'Create · Manage · Print Addendums. Compliant by Design.',
  subhead = 'Beautiful vehicle addendums. Built-in compliance. Ready in seconds.',
  logos,
}: HomeBProps) {
  return (
    <main className="w-full overflow-x-clip bg-white font-sans text-[#0F2A52]">
      <Hero trialHref={trialHref} headline={headline} subhead={subhead} />
      <ValueProps />
      <PlatformShowcase />
      <TrustedBy dealerCount={dealerCount} logos={logos} />
      <FinalCta trialHref={trialHref} />
    </main>
  );
}
