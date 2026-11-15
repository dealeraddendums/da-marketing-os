import Rotator, { type RotatorSlide } from '../Rotator';

// App-screen slider (exits left, enters from the right). Static while it has
// one slide; Allan is supplying a set of 4 marketing-clean screenshots — add
// them here at 2880×1800 (16:10) and the slide animation kicks in by itself.
const screenshotSlides: RotatorSlide[] = [
  { src: '/home-b/platform-screenshot.png', width: 2880, height: 1800, alt: 'DealerAddendums inventory management platform screenshot' },
];

export default function PlatformShowcase() {
  return (
    <section id="platform" data-ab-section="platform" aria-labelledby="home-b-platform-title" className="scroll-mt-20 bg-[#F4F7FA] py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-12 lg:gap-14 lg:px-10">
        <div className="lg:col-span-7">
          <Rotator mode="slide" lazyMount slides={screenshotSlides} sizes="(max-width: 1023px) 100vw, 58vw" className="rounded-xl border border-slate-200 bg-white shadow-2xl" />
        </div>
        <div id="how-it-works" className="scroll-mt-20 lg:col-span-5">
          <p className="mb-5 border-l-4 border-[#F5A623] pl-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[#0F2A52]">The easy way to manage vehicle addendums</p>
          <h2 id="home-b-platform-title" className="text-5xl font-black italic uppercase leading-[0.98] tracking-tight text-[#1E4F95] sm:text-6xl">Create.<br />Manage.<br /><span className="text-[#E68A13]">Print.</span></h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-700">A simple, powerful platform for franchise dealerships with the compliance, flexibility, and speed you need.</p>
        </div>
      </div>
    </section>
  );
}
