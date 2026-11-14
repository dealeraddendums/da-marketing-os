# Home B image asset manifest

Put the following image files in `public/home-b/`. Dimensions below are recommended source dimensions, not mandatory exact sizes. Use optimized PNG/WebP/JPEG as appropriate; keep intrinsic aspect ratios aligned with the supplied `Image` width/height props. Do not put sensitive customer data in screenshots.

| File path | Recommended pixels | Aspect ratio | Alt text | Description |
| --- | ---: | ---: | --- | --- |
| `/public/home-b/dealeraddendums-logo.png` | 1947 × 451 (real, in place) | 4.32:1 | DealerAddendums | Transparent-background wordmark with BLACK text — only render on white/light backgrounds; header renders it at 190 × 44. |
| `/public/home-b/hero-dealership.jpg` | 5000 × 2812 (real, in place) | 16:9 | Modern blue SUV outside a contemporary dealership | Rendered via `fill` with a left-to-right navy gradient overlay so the white headline stays readable. |
| `/public/home-b/honda-addendum.png` | 1168 × 3036 (real, in place) | 0.385:1 | Example Honda CR-V dealership vehicle addendum showing branded vehicle images, pricing, and disclosures | Real Honda CR-V addendum artwork; fine print is part of the image, not HTML. |
| `/public/home-b/platform-screenshot.png` | 2880 × 1800 (real, in place) | 8:5 (1.6:1) | DealerAddendums inventory management platform screenshot | Downscaled from a 6001 × 3750 original (original not committed). |
| `/public/home-b/logos/<slug>.png` | 400 × 160 each (real, in place — 6 files) | 5:2 (2.5:1) | Passed from `logos[].name` | lithia, autonation, penske-automotive, group-1-automotive, asbury-automotive-group, sonic-automotive. Each is a transparent 400×160 canvas with the trimmed mark fitted into a 340×110 content box (visual weight matched); sources were uniform 1667×667 transparent PNGs. Supplied through the `logos` prop in `app/page.tsx`. |

The trust-strip images are dynamic, so their exact paths and dimensions come from the `logos` prop. For remote logo URLs, Next.js requires an existing `images.remotePatterns` configuration; local `/home-b/` files need no config changes.
