# Home B image asset manifest

Put the following image files in `public/home-b/`. Dimensions below are recommended source dimensions, not mandatory exact sizes. Use optimized PNG/WebP/JPEG as appropriate; keep intrinsic aspect ratios aligned with the supplied `Image` width/height props. Do not put sensitive customer data in screenshots.

| File path | Recommended pixels | Aspect ratio | Alt text | Description |
| --- | ---: | ---: | --- | --- |
| `/public/home-b/dealeraddendums-logo.png` | 520 × 110 | 52:11 (4.73:1) | DealerAddendums | Official horizontal DealerAddendums wordmark on transparent background, with blue roundel and orange lettering. |
| `/public/home-b/hero-dealership.jpg` | 2400 × 1350 | 16:9 | Modern blue SUV outside a contemporary dealership | Premium real-world dealership photo, blue SUV positioned toward center/right with clear space at left for white copy. |
| `/public/home-b/honda-addendum.png` | 850 × 2000 | 17:40 (0.425:1) | Example Honda CR-V dealership vehicle addendum showing branded vehicle images, pricing, and disclosures | Real Honda CR-V addendum artwork cropped to its actual tall print proportions; fine print is part of the image, not HTML. |
| `/public/home-b/platform-screenshot.png` | 1440 × 900 | 8:5 (1.6:1) | DealerAddendums inventory management platform screenshot | Clean screenshot of the dealer-facing inventory interface; avoid internal admin/CRM/billing tabs or customer-sensitive data. |
| `/public/home-b/logos/<slug>.png` | 400 × 160 each | 5:2 (2.5:1) | Passed from `logos[].name` | Optional approved customer/group logos supplied through the `logos` prop; filenames, dimensions and count are entirely caller-defined. |

The trust-strip images are dynamic, so their exact paths and dimensions come from the `logos` prop. For remote logo URLs, Next.js requires an existing `images.remotePatterns` configuration; local `/home-b/` files need no config changes.
