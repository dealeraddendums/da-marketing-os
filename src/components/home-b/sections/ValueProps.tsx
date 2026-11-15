import type { ReactNode } from 'react';

function ShieldIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><path d="M24 4 40 10v13c0 11-7 18-16 21C15 41 8 34 8 23V10L24 4Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="m16 23 6 6 11-12" stroke="#F5A623" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function LayersIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#1E4F95]"><path d="m24 5 19 11-19 11L5 16 24 5Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="m6 25 18 11 18-11M6 33l18 11 18-11" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function BoltIcon() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-[#F5A623]"><path d="M27 3 9 27h14l-2 18 18-26H25l2-16Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/></svg>;
}
const items: { title: string; description: string; icon: ReactNode }[] = [
  { title: 'Stay Compliant', description: "Conform your addendums to federal, state and corporate requirements — including the Buyer's Guide. Whatever your legal team requests, we can implement.", icon: <ShieldIcon /> },
  { title: 'Look Professional', description: 'Clean, branded addendums that highlight your vehicles and authorized options.', icon: <LayersIcon /> },
  { title: 'Print in Seconds', description: 'Create accurate, compliant documents in just a few clicks and get them to the window right away.', icon: <BoltIcon /> },
];

export default function ValueProps() {
  return (
    <section id="compliance" data-ab-section="value_props" aria-labelledby="home-b-value-title" className="scroll-mt-20 bg-white py-16 sm:py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-10">
        <div className="lg:col-span-4">
          <h2 id="home-b-value-title" className="text-4xl font-black uppercase leading-[1.05] tracking-tight text-[#0F2A52] sm:text-5xl">Good Looks.<br /><span className="text-[#E68A13]">Serious Compliance.</span></h2>
        </div>
        <div className="grid gap-8 sm:grid-cols-3 lg:col-span-8 lg:gap-5">
          {items.map((item) => (
            <article key={item.title} className="border-l-2 border-[#0F2A52]/20 pl-5 sm:pl-4">
              {item.icon}
              <h3 className="mt-4 text-xl font-extrabold leading-tight text-[#0F2A52]">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
