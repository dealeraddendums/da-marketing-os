import Image from 'next/image';

// Three-step workflow strip mapping to the "Create. Manage. Print." heading.
// Screenshots are 2400×1500 (16:10) downscales of ~6000×3750 originals (not committed).
const steps: { number: string; title: string; description: string; src: string; alt: string }[] = [
  {
    number: '1',
    title: 'Create',
    description: 'Drag-and-drop template builder with your logo, required and suggested products, QR codes, photos, and the required disclosure built in.',
    src: '/home-b/platform-builder.png',
    alt: 'DealerAddendums template builder with a branded Honda addendum on the canvas',
  },
  {
    number: '2',
    title: 'Manage',
    description: 'Inventory flows in from any website provider or DMS and gets addended automatically. No more error-prone copy/paste.',
    src: '/home-b/platform-inventory.png',
    alt: 'DealerAddendums inventory screen listing vehicles with print status and one-click Print Now buttons',
  },
  {
    number: '3',
    title: 'Print',
    description: 'Every vehicle gets its own addendum in seconds, with rules-based products added automatically. Preview, download, or send straight to the printer.',
    src: '/home-b/platform-preview.png',
    alt: 'Finished vehicle addendum previewed with Download PDF and Send to Printer buttons',
  },
];

export default function PlatformShowcase() {
  return (
    <section id="platform" data-ab-section="platform" aria-labelledby="home-b-platform-title" className="scroll-mt-20 bg-[#F4F7FA] py-16 sm:py-20">
      {/* The nav's How It Works anchor lands on this same section (a section can only carry one id). */}
      <div id="how-it-works" className="scroll-mt-20" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <p className="mb-5 border-l-4 border-[#F5A623] pl-4 text-xs font-extrabold uppercase tracking-[0.18em] text-[#0F2A52]">The easy way to manage vehicle addendums</p>
          <h2 id="home-b-platform-title" className="text-5xl font-black italic uppercase leading-[0.98] tracking-tight text-[#1E4F95] sm:text-6xl">Create. Manage. <span className="text-[#E68A13]">Print.</span></h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-700">A simple, powerful platform for franchise dealerships with the compliance, flexibility, and speed you need.</p>
        </div>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="flex flex-col">
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {/* Thin browser-chrome bar — deliberately no fake traffic lights. */}
                <div aria-hidden="true" className="h-4 border-b border-slate-200 bg-slate-100 sm:h-5" />
                <Image src={step.src} alt={step.alt} width={2400} height={1500} sizes="(min-width:1024px) 33vw, 100vw" className="h-auto w-full" />
              </div>
              <div className="mt-5 flex items-baseline gap-3">
                <span aria-hidden="true" className="text-3xl font-black italic leading-none text-[#E68A13]">{step.number}</span>
                <h3 className="text-xl font-extrabold uppercase tracking-tight text-[#0F2A52]">{step.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
