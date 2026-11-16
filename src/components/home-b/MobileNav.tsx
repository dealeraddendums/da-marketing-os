'use client';

import { useState } from 'react';
import Link from 'next/link';
import LoginMenu from '../marketing/LoginMenu';

// In-page anchors — keep in sync with the navigation const in sections/Hero.tsx.
const links = [
  { label: 'Product', href: '#platform' },
  { label: 'Features', href: '#features' },
  { label: 'Compliance', href: '#compliance' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
];

export default function MobileNav({ trialHref }: { trialHref: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        aria-expanded={open}
        aria-controls="home-b-mobile-menu"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[#0F2A52]/20 text-[#0F2A52] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A52]"
      >
        <span aria-hidden="true" className="text-2xl leading-none">{open ? '×' : '☰'}</span>
      </button>
      {open && (
        <nav id="home-b-mobile-menu" aria-label="Mobile navigation" className="absolute inset-x-0 top-full z-50 border-t border-slate-200 bg-white px-5 py-5 shadow-xl">
          <ul className="flex flex-col gap-1">
            {/* First item: Log In — the same 5.0/4.0 chooser homepage A uses,
                so an existing dealer sees their way in before the sales nav. */}
            <li>
              <LoginMenu
                variant="light"
                align="left"
                dataAbCta="nav_login"
                triggerHoverColor="#C47A0D"
                triggerStyle={{ fontSize: 16, fontWeight: 600, color: '#0F2A52', fontFamily: 'inherit', padding: '12px 12px' }}
              />
            </li>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-3 font-semibold hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0F2A52]">{link.label}</Link>
              </li>
            ))}
            <li className="pt-3">
              <Link href={trialHref} data-ab-cta="nav_trial" onClick={() => setOpen(false)} className="block rounded-md bg-[#F5A623] px-5 py-3 text-center font-bold text-[#0F2A52] hover:bg-[#e99512] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2A52]">Start Free Trial</Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
