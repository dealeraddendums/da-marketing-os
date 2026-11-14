# Home B: Next.js 14 homepage variant

Copy `components/home-b/` into your project, supply the files listed in `assets.manifest.md` under `public/home-b/`, and render from `app/page.tsx`:

```tsx
import HomeB from '@/components/home-b/HomeB';

export default function Page() {
  return (
    <HomeB
      trialHref="/trial"
      dealerCount="1,600+"
      logos={[
        { name: 'Approved Customer One', src: '/home-b/logos/customer-one.png', width: 400, height: 160 },
      ]}
    />
  );
}
```

Props: `trialHref: string` (required), `dealerCount: string` (required), `logos: { name: string; src: string; width: number; height: number }[]` (required; can be empty), `headline?: string` (defaults to `Create · Manage · Print Addendums. Compliant by Design.`), and `subhead?: string` (defaults to `Beautiful vehicle addendums. Built-in compliance. Ready in seconds.`).

All images use `next/image`; all links use `next/link`. No global CSS, custom Tailwind config, fonts, packages, or analytics code are required. Mobile navigation is the only client component. The page does not replace your existing header/footer automatically; avoid rendering a second site-wide header if your root layout already includes one. Review compliance claims and obtain permission for displayed group logos before launch.
