export interface PersonalizationVariant {
  headline: string
  subheadline: string
  cta: string
  socialProof: string
  heroStat?: string
  testimonialFilter?: string
}

export const STATIC_TERM_MAP: Record<string, PersonalizationVariant> = {
  'car dealer addendum software': {
    headline: 'The #1 Addendum Software for Car Dealers',
    subheadline: 'Stop printing addendums by hand. 1,600+ dealers automate it in seconds.',
    cta: 'Start Free Trial',
    socialProof: 'Trusted by 1,644 dealerships since 2014',
    heroStat: '526 addendums printed today',
  },
  'vehicle addendum': {
    headline: 'Vehicle Addendums. Done in 30 Seconds.',
    subheadline: 'Customized, compliant addendums for every vehicle on your lot — printed or digital.',
    cta: 'See How It Works',
    socialProof: '2.3M+ addendums printed',
  },
  'dealer addendum': {
    headline: 'The Addendum Platform Dealers Actually Love',
    subheadline: 'No contracts. No setup fees. Up and running today.',
    cta: 'Start Free Trial',
    socialProof: 'Month-to-month. Cancel anytime.',
  },
  'addendum software': {
    headline: 'Addendum Software Built for Real Dealerships',
    subheadline: 'Auto-applies products based on year, make, model, and trim. Set it once, done forever.',
    cta: 'Try It Free',
    socialProof: '32,000+ updates driven by dealer feedback',
  },
  'car addendum': {
    headline: 'Car Addendums. Professional. Compliant. Fast.',
    subheadline: 'Print branded, compliant addendums from any device — desktop, tablet, or iOS.',
    cta: 'Start Free Trial',
    socialProof: 'Used by franchise and independent dealers',
  },
  'buyers guide software': {
    headline: 'FTC Buyers Guides. Printed in Seconds.',
    subheadline: 'As-Is, Implied, and Warranty Buyers Guides in English and Spanish — one click.',
    cta: 'Try Free Today',
    socialProof: 'FTC-compliant templates built in',
    testimonialFilter: 'used-car',
  },
  'ftc buyers guide': {
    headline: 'Stay FTC Compliant Without the Headache',
    subheadline: 'Print certified FTC Buyers Guides for every used vehicle. English and Spanish included.',
    cta: 'Start Free Trial',
    socialProof: 'Compliance-first since 2014',
    testimonialFilter: 'used-car',
  },
  'used car buyers guide': {
    headline: 'Used Car Buyers Guides — Fast & Compliant',
    subheadline: 'One-click FTC Buyers Guides for your entire used inventory.',
    cta: 'Try It Free',
    socialProof: '1,644 dealers print buyers guides with us',
    testimonialFilter: 'used-car',
  },
  'new car dealer addendum': {
    headline: 'New Car Addendums That Match Your Brand',
    subheadline: 'Custom logos, watermarks, and dealer pricing — looking professional from day one.',
    cta: 'Start Free Trial',
    socialProof: 'Franchise and independent dealers welcome',
    testimonialFilter: 'new-car',
  },
  'franchise dealer addendum': {
    headline: 'Addendum Software for Franchise Dealerships',
    subheadline: 'Multi-rooftop management, group discounts, and OEM-compliant templates.',
    cta: 'Talk to Sales',
    socialProof: 'Group accounts available',
    testimonialFilter: 'franchise',
  },
  'used car dealer software': {
    headline: "The Used Car Dealer's Secret Weapon",
    subheadline: 'Addendums, buyers guides, and CPO info sheets — all from one platform.',
    cta: 'Start Free Trial',
    socialProof: 'Built for independent and franchise used car lots',
    testimonialFilter: 'used-car',
  },
  'independent dealer addendum': {
    headline: 'Professional Addendums for Independent Dealers',
    subheadline: 'Look like a franchise dealer without the franchise overhead.',
    cta: 'Try Free Today',
    socialProof: 'Month-to-month, no contracts',
    testimonialFilter: 'independent',
  },
  'cpo vehicle info sheet': {
    headline: 'CPO Info Sheets. Printed in One Click.',
    subheadline: 'Certified Pre-Owned vehicle information sheets with your logo and vehicle data.',
    cta: 'See an Example',
    socialProof: 'English and Spanish available',
  },
  'kia dealer addendum': {
    headline: 'Built for Kia Dealerships',
    subheadline: 'Kia-branded addendums with your dealer logo, preloaded OEM products, and compliance templates.',
    cta: 'Start Free Trial',
    socialProof: 'Franchise-ready templates included',
    testimonialFilter: 'kia',
  },
  'ford dealer addendum': {
    headline: 'Ford Dealer Addendums — Done Right',
    subheadline: 'Ford-compliant addendum templates with your dealer branding and preloaded F&I products.',
    cta: 'Start Free Trial',
    socialProof: '1,644 dealers trust DealerAddendums',
    testimonialFilter: 'ford',
  },
  'toyota dealer addendum': {
    headline: 'Toyota Dealer Addendums in 30 Seconds',
    subheadline: 'Pre-built Toyota templates. Add your logo, products, and pricing — print instantly.',
    cta: 'Try It Free',
    socialProof: 'Multi-rooftop accounts available',
  },
  'honda dealer addendum': {
    headline: 'Honda Dealer Addendums Made Easy',
    subheadline: 'Compliant Honda addendum templates with your dealership branding.',
    cta: 'Start Free Trial',
    socialProof: 'Used by Honda dealers nationwide',
  },
  'chevy dealer addendum': {
    headline: 'Chevrolet Dealer Addendums — Fast & Professional',
    subheadline: 'GM-compatible addendum templates with logo, pricing, and dealer mark-ups.',
    cta: 'Try Free Today',
    socialProof: 'Trusted since 2014',
  },
  'nissan dealer addendum': {
    headline: 'Nissan Dealer Addendums Done in Seconds',
    subheadline: 'Print compliant, branded Nissan addendums for every vehicle on your lot.',
    cta: 'Start Free Trial',
    socialProof: '526 addendums printed today',
  },
  'ftc compliance car dealer': {
    headline: 'Stay FTC Compliant. Automatically.',
    subheadline: 'MSRP transparency, required disclosures, and compliant pricing — built into every addendum.',
    cta: 'See Compliance Features',
    socialProof: 'Compliance-first templates since 2014',
    testimonialFilter: 'compliance',
  },
  'dealer compliance software': {
    headline: "Compliance That Doesn't Slow You Down",
    subheadline: 'FTC-compliant addendums and buyers guides printed in seconds, not hours.',
    cta: 'Start Free Trial',
    socialProof: 'Trusted by 1,644 dealers',
  },
  'dealeraddendums alternative': {
    headline: 'You Found the Original. Welcome.',
    subheadline: 'DealerAddendums has been the #1 addendum platform since 2014. See why 1,600+ dealers agree.',
    cta: 'Start Free Trial',
    socialProof: '2.3M+ addendums printed',
  },
  'addendum software alternative': {
    headline: "The Last Addendum Software You'll Ever Try",
    subheadline: 'No contracts. Instant setup. 32,000+ features shaped by real dealer feedback.',
    cta: 'Try It Free',
    socialProof: 'Month-to-month. Cancel anytime.',
  },
  'vehicle description generator': {
    headline: 'AI-Written Vehicle Descriptions. Instantly.',
    subheadline: 'SEO-compliant vehicle descriptions generated by AI — right inside your addendum workflow.',
    cta: 'See AI Features',
    socialProof: 'Part of the DealerAddendums platform',
  },
  'vin scanner app': {
    headline: 'Scan a VIN. Print an Addendum. Done.',
    subheadline: 'The DA Installer iOS app lets your team scan VINs and print addendums from the lot.',
    cta: 'See the iOS App',
    socialProof: 'iOS app available — $10/mo add-on',
  },
  'qr code lead generation car dealer': {
    headline: 'Turn Your Addendums Into Lead Machines',
    subheadline: 'QR codes on every addendum capture buyer name, phone, and vehicle interest automatically.',
    cta: 'See SMS Lead Capture',
    socialProof: 'SMS lead capture — $50/mo add-on',
  },
  'dealer inventory feed': {
    headline: '2-Way Inventory Data. Zero Manual Work.',
    subheadline: 'We pull your inventory automatically and push addendum data back to your website and syndication partners.',
    cta: 'See Integrations',
    socialProof: 'Compatible with major DMS providers',
  },
}

export function detectDealerType(text: string): string {
  const t = text.toLowerCase()
  if (t.match(/kia|ford|toyota|honda|chevy|chevrolet|nissan|gm|bmw|mercedes|audi|hyundai|subaru|mazda|jeep|dodge|ram/)) {
    const make = t.match(/(kia|ford|toyota|honda|chevy|chevrolet|nissan|gm|bmw|mercedes|audi|hyundai|subaru|mazda|jeep|dodge|ram)/)?.[1]
    return make === 'chevy' ? 'chevrolet' : (make || 'franchise')
  }
  if (t.match(/used|independent|cpo|certified/)) return 'used-car'
  if (t.match(/franchise|group|multi|rooftop/)) return 'franchise'
  if (t.match(/ftc|compliance|buyers guide/)) return 'compliance'
  if (t.match(/ios|app|mobile|scan/)) return 'mobile'
  return 'general'
}

// ── Dealer-type copy variants ───────────────────────────────
// Used when abVariant === 'dealertype'. Keyed by detectDealerType() output.
export const DEALERTYPE_COPY: Record<string, PersonalizationVariant> = {
  kia: {
    headline: 'The Addendum Solution Built for Kia Dealers',
    subheadline: 'Pre-loaded Kia OEM products, franchise-compliant templates, and same-day setup for your entire lot.',
    cta: 'Start Free Trial',
    socialProof: 'Trusted by Kia franchise dealers nationwide',
    testimonialFilter: 'franchise',
  },
  ford: {
    headline: 'Ford Dealer Paperwork — Automated',
    subheadline: 'Ford-compliant addendum templates with your dealer branding, preloaded F&I products, and instant printing.',
    cta: 'Start Free Trial',
    socialProof: '1,644 dealers choose DealerAddendums',
    testimonialFilter: 'franchise',
  },
  toyota: {
    headline: 'Toyota Dealers: Print Addendums in 30 Seconds',
    subheadline: 'Pre-built Toyota templates with your logo and pricing — print from any device on the lot.',
    cta: 'Try It Free',
    socialProof: 'Multi-rooftop accounts available',
  },
  honda: {
    headline: 'Honda Dealer Addendums — Fast, Branded, Compliant',
    subheadline: 'Compliant Honda addendum templates with your dealership branding and OEM product lines.',
    cta: 'Start Free Trial',
    socialProof: 'Used by Honda dealers coast to coast',
  },
  chevrolet: {
    headline: 'Chevy Dealers: Professional Addendums in Minutes',
    subheadline: 'GM-compatible templates with your logo, dealer mark-ups, and compliance disclosures built in.',
    cta: 'Try Free Today',
    socialProof: 'Trusted by Chevrolet franchise dealers',
  },
  nissan: {
    headline: 'Nissan Dealers: From Scan to Addendum in Seconds',
    subheadline: 'Print branded Nissan addendums for every unit on your lot — from your desk or the lot.',
    cta: 'Start Free Trial',
    socialProof: '526 addendums printed today',
  },
  bmw: {
    headline: 'BMW Dealers: Addendums That Match Your Standard',
    subheadline: 'Premium-formatted addendums with your BMW dealer branding and F&I product suite.',
    cta: 'Start Free Trial',
    socialProof: 'Franchise-compliant templates included',
  },
  'used-car': {
    headline: 'The Used Car Dealer Platform That Does It All',
    subheadline: 'Addendums, FTC Buyers Guides, and CPO Info Sheets — all from one platform, all compliant.',
    cta: 'Start Free Trial',
    socialProof: 'Built for independent and franchise used car dealers',
    testimonialFilter: 'used-car',
  },
  franchise: {
    headline: 'Enterprise Addendum Management for Franchise Groups',
    subheadline: 'Manage all your rooftops from one account. Group pricing, consistent branding, centralized control.',
    cta: 'Talk to Sales',
    socialProof: 'Group accounts for 2+ rooftops available',
    testimonialFilter: 'franchise',
  },
  compliance: {
    headline: 'FTC Compliance — Built Into Every Addendum',
    subheadline: 'MSRP transparency, required disclosures, and compliant Buyers Guides — automatic on every vehicle.',
    cta: 'See Compliance Features',
    socialProof: 'Compliance-first since 2014',
    testimonialFilter: 'compliance',
  },
  mobile: {
    headline: 'Scan a VIN. Print an Addendum. Walk Away.',
    subheadline: 'The DA Installer iOS app lets your team scan VINs and print addendums anywhere on the lot.',
    cta: 'See the iOS App',
    socialProof: 'iOS app add-on — $10/month',
  },
  general: {
    headline: 'The Professional Addendum Platform for Car Dealers',
    subheadline: 'Vehicle addendums, buyers guides, and info sheets — professional, compliant, and fast.',
    cta: 'Start Free Trial',
    socialProof: 'Trusted by 1,644 dealerships since 2014',
  },
}

// ── Generic (control) copy ──────────────────────────────────
// Used when abVariant === 'generic'. No UTM influence at all.
export const GENERIC_COPY: PersonalizationVariant = {
  headline: 'The #1 Addendum Platform for Car Dealers',
  subheadline: 'Easily print customized vehicle addendums, buyers guides, and info sheets from any device. 1,600+ dealerships trust DealerAddendums.',
  cta: 'Start Free Trial',
  socialProof: 'Trusted by 1,644 dealerships since 2014',
}

export interface PersonalizationContext {
  abVariant: string
  layoutVariant: string
  utmTerm: string
  utmCampaign: string
  dealerType: string
  staticMatch: boolean
  needsAI: boolean
  headline: string | null
  subheadline: string | null
  cta: string | null
  socialProof: string | null
}

export function buildPersonalizationContext(
  headerMap: Record<string, string>,
  termMap: Record<string, PersonalizationVariant> = STATIC_TERM_MAP
): PersonalizationContext {
  const abVariant     = headerMap['x-ab-variant']     || 'generic'
  const layoutVariant = headerMap['x-layout-variant'] || 'b'
  const utmTerm       = headerMap['x-utm-term']       || ''
  const utmCampaign   = headerMap['x-utm-campaign']   || ''
  const dealerType    = headerMap['x-dealer-type']    || 'general'
  const needsAI       = headerMap['x-needs-ai']       === 'true'

  const normalizedTerm = utmTerm.toLowerCase().trim()
  const variant = termMap[normalizedTerm] || null

  return {
    abVariant,
    layoutVariant,
    utmTerm,
    utmCampaign,
    dealerType,
    staticMatch: !!variant,
    needsAI: needsAI && !variant,
    headline:    variant?.headline    || null,
    subheadline: variant?.subheadline || null,
    cta:         variant?.cta         || null,
    socialProof: variant?.socialProof || null,
  }
}
