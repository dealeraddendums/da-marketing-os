import Image from 'next/image';
import type { HomeBLogo } from '../HomeB';

type TrustedByProps = { dealerCount: string; logos: HomeBLogo[] };

export default function TrustedBy({ dealerCount, logos }: TrustedByProps) {
  return (
    <section data-ab-section="trusted_by" aria-labelledby="home-b-trusted-title" className="bg-white py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-5 text-center sm:px-8 lg:px-10">
        <h2 id="home-b-trusted-title" className="text-sm font-black uppercase tracking-[0.18em] text-[#0F2A52] sm:text-base">Trusted by {dealerCount} franchise dealerships</h2>
        {logos.length > 0 && (
          <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-9 gap-y-8 sm:gap-x-12">
            {logos.map((logo, index) => (
              <li key={`${logo.name}-${index}`} className="flex w-[calc(50%-1.5rem)] items-center justify-center sm:w-[calc(33.333%-2rem)] lg:w-auto lg:flex-1">
                <Image src={logo.src} width={logo.width} height={logo.height} alt={logo.name} sizes="(max-width: 640px) 40vw, (max-width: 1024px) 25vw, 180px" className="max-h-14 w-auto max-w-full object-contain" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
