'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export type RotatorSlide = { src: string; alt: string; width: number; height: number };

type RotatorProps = {
  slides: RotatorSlide[];
  /** fade = crossfade in place; slide = active exits left, next enters from the right */
  mode: 'fade' | 'slide';
  intervalMs?: number;
  /** Frame styles (shadow, ring, padding, rotation…) go here — slide 0 sizes the box. */
  className?: string;
  sizes?: string;
  /** priority-load slide 0 (hero use) */
  priority?: boolean;
  /** defer mounting slides 1+ until the rotator nears the viewport (below-the-fold use) */
  lazyMount?: boolean;
};

export default function Rotator({ slides, mode, intervalMs = 5000, className = '', sizes, priority = false, lazyMount = false }: RotatorProps) {
  const [active, setActive] = useState(0);
  const [mountAll, setMountAll] = useState(!lazyMount);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!lazyMount || mountAll) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setMountAll(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setMountAll(true); io.disconnect(); } },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazyMount, mountAll]);

  useEffect(() => {
    if (slides.length < 2 || !mountAll) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % slides.length), intervalMs);
    return () => clearInterval(id);
  }, [slides.length, intervalMs, mountAll]);

  // With exactly 2 slides, "exit left / enter right" needs a third staging
  // position, so render each slide twice and cycle through 4 — the n ≥ 3
  // carousel logic then always moves in one direction. Same images, no extra
  // downloads.
  const renderSlides = mode === 'slide' && slides.length === 2 ? [...slides, ...slides] : slides;
  const n = renderSlides.length;
  const prev = (active - 1 + n) % n;

  return (
    <div ref={ref} className={`relative ${mode === 'slide' ? 'overflow-hidden' : ''} ${className}`}>
      {(mountAll ? renderSlides : renderSlides.slice(0, 1)).map((slide, i) => {
        // Slide 0 stays in normal flow and sizes the box (its aspect ratio must
        // be representative); the rest stack on top of it.
        const base = i === 0 ? 'relative h-auto w-full' : 'absolute inset-0 h-full w-full object-cover';
        const motion =
          mode === 'fade'
            ? `transition-opacity duration-1000 ${i === active ? 'opacity-100' : 'opacity-0'}`
            : i === active
              ? 'translate-x-0 transition-transform duration-700 ease-in-out'
              : i === prev
                ? '-translate-x-full transition-transform duration-700 ease-in-out'
                : 'translate-x-full transition-none';
        return (
          <Image
            key={`${slide.src}-${i}`}
            src={slide.src}
            alt={slide.alt}
            width={slide.width}
            height={slide.height}
            sizes={sizes}
            priority={priority && i === 0}
            aria-hidden={i !== active}
            className={`${base} ${motion}`}
          />
        );
      })}
    </div>
  );
}
