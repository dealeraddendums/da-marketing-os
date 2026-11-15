import Link from 'next/link';
import CopyrightNotice from '../../shared/CopyrightNotice';

export default function FinalCta({ trialHref }: { trialHref: string }) {
  return (
    <section data-ab-section="final_cta" aria-labelledby="home-b-final-title" className="relative overflow-hidden bg-[#0F2A52] py-16 text-white sm:py-20">
      <div aria-hidden="true" className="absolute -right-24 -top-12 h-28 w-[65%] -rotate-6 bg-[#F5A623] sm:h-36" />
      <div className="relative mx-auto max-w-7xl px-5 text-center sm:px-8 lg:px-10">
        <h2 id="home-b-final-title" className="text-3xl font-black tracking-tight sm:text-5xl">Ready to make every vehicle look the part?</h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-white/90">Professional addendums. Built-in compliance. A faster way to print.</p>
        <Link href={trialHref} data-ab-cta="footer_primary" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-md bg-[#F5A623] px-7 py-3 text-base font-extrabold text-[#0F2A52] transition-colors hover:bg-[#e99512] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start Your Free 30-Day Trial <span aria-hidden="true" className="ml-2">→</span></Link>
        {/* B had no copyright line at all — this is the page's footer section. */}
        <CopyrightNotice className="mt-10 text-sm text-white/60" />
      </div>
    </section>
  );
}
