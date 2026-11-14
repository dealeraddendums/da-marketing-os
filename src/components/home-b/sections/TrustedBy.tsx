import Image from 'next/image';
import type { HomeBLogo } from '../HomeB';

type TrustedByProps = { dealerCount: string; logos: HomeBLogo[] };

export default function TrustedBy({ dealerCount, logos }: TrustedByProps) {
  return (
    <section data-ab-section="trusted_by" aria-labelledby="home-b-trusted-title" className="border-y border-slate-200 bg-white py-12 sm:py-14">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <h2 id="home-b-trusted-title" className="text-center text-xs font-black uppercase tracking-[0.18em] text-[#0F2A52] sm:text-sm">Trusted by {dealerCount} franchise dealerships</h2>
        {logos.length > 0 && (
          <ul className="mt-8 grid grid-cols-2 items-center gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-8">
            {logos.map((logo) => (
              <li key={logo.name} className="flex h-16 items-center justify-center sm:h-20">
                {/* Logo PNGs are pre-normalized onto a 400×160 transparent canvas, so h-full + object-contain gives every mark the same cell without any one dominating. */}
                <Image src={logo.src} width={logo.width} height={logo.height} alt={logo.name} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 180px" className="h-full w-full object-contain opacity-70 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
