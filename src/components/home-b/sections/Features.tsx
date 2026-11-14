import type { ReactNode } from 'react';

// Icons follow ValueProps' stroke style: 48×48 viewBox, navy stroke
// (#1E4F95 via currentColor), strokeWidth 2.5, one orange (#F5A623) accent.
function AddendumIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><rect x="10" y="5" width="28" height="38" rx="2.5" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="M16 13h16M16 19h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M12 26h24" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"/><path d="M16 33h10M16 38h7" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"/></svg>;
}
function MagicButtonIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><rect x="5" y="16" width="30" height="14" rx="7" stroke="currentColor" strokeWidth="2.5"/><path d="m30 27 10 10-4.5 1.5L34 43l-4-11.5V27h0Z" stroke="#F5A623" strokeWidth="2.5" strokeLinejoin="round"/><path d="M40 10v6M37 13h6" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"/></svg>;
}
function SyncIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><path d="M38 20a15 15 0 0 0-26-5M10 28a15 15 0 0 0 26 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M12 8v8h8" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M36 40v-8h-8" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function RulesIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><path d="M6 8h36L28 25v15l-8 4V25L6 8Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="m31 33 4 4 8-9" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function PhoneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><rect x="14" y="4" width="20" height="40" rx="3.5" stroke="currentColor" strokeWidth="2.5"/><path d="M21 8h6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M10 22h28" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"/><path d="M20 30h8M20 35h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>;
}
function AiTextIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><path d="M8 10h26M8 18h26M8 26h16M8 34h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M37 24 39.5 30.5 46 33l-6.5 2.5L37 42l-2.5-6.5L28 33l6.5-2.5L37 24Z" stroke="#F5A623" strokeWidth="2.5" strokeLinejoin="round"/></svg>;
}

// Copy taken verbatim from the live homepage's features data
// (components/marketing/FeaturesSection.tsx FEATURES) — six of the twelve.
const items: { title: string; description: string; icon: ReactNode }[] = [
  {
    title: 'Required + Suggested Addendums',
    description: 'One addendum, two clearly labeled sections — buyers see what’s part of the price and what’s optional at a glance.',
    icon: <AddendumIcon />,
  },
  {
    title: 'Magic Button',
    description: 'Embed a one-click Magic Button on your VDP that shows shoppers the exact PDF addendum from the lot — your online listing carries the same disclosures as the printed sticker.',
    icon: <MagicButtonIcon />,
  },
  {
    title: 'Automatic Inventory — Any Provider',
    description: 'Inventory flows in automatically from any website provider, syndication company, or DMS — your lot syncs itself, no manual VIN entry. Addendum data feeds back out, too.',
    icon: <SyncIcon />,
  },
  {
    title: 'Rules-Based Products',
    description: 'Set a product once with rules — make, model, trim, year, body style, mileage, fuel type — and it auto-applies to every matching vehicle. New inventory is addended automatically.',
    icon: <RulesIcon />,
  },
  {
    title: 'iPhone App — Included',
    description: 'DealerAddendums 5.0 for iPhone is on the App Store: scan VINs, QR codes, or barcodes on the lot, build the addendum on the spot, and AirPrint it or queue it for your desk printer. Included with every plan.',
    icon: <PhoneIcon />,
  },
  {
    title: 'AI Vehicle Descriptions',
    description: 'Tired of writing SEO-compliant vehicle descriptions? Our AI CarDescriptions tool generates them automatically for every unit on your lot.',
    icon: <AiTextIcon />,
  },
];

export default function Features() {
  return (
    <section id="features" data-ab-section="features" aria-labelledby="home-b-features-title" className="scroll-mt-20 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="home-b-features-title" className="text-4xl font-black uppercase leading-[1.05] tracking-tight text-[#0F2A52] sm:text-5xl">Everything Your <span className="text-[#E68A13]">Dealership Needs</span></h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-700">From automatic inventory to one-click printing — DealerAddendums handles the paperwork.</p>
        </div>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-12">
          {items.map((item) => (
            <article key={item.title} className="border-l-2 border-[#0F2A52]/20 pl-5">
              {item.icon}
              <h3 className="mt-4 text-xl font-extrabold leading-tight text-[#0F2A52]">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.description}</p>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-slate-600">
          Plus FTC Buyers Guides, CPO info sheets, multi-rooftop groups, custom branding, and color-matched vehicle images.{' '}
          {/* /#features is the live homepage's 12-card features anchor (FeaturesSection's own id). */}
          <a href="/#features" className="whitespace-nowrap font-semibold text-[#1E4F95] underline underline-offset-2 hover:text-[#C47A0D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A52]">See all features →</a>
        </p>
      </div>
    </section>
  );
}
