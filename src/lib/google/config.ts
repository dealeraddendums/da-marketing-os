// Google integration — environment + capability flags.
//
// Phase 1 is read-only. Nothing here mutates a Google account; the Ads client
// deliberately exposes no write surface at all (see ads.ts).
//
// Every surface degrades independently: a missing variable must always produce
// a "not connected" panel, never a crash — so callers read these flags rather
// than assuming the values exist.

export const googleEnv = {
  clientId:          process.env.GOOGLE_OAUTH_CLIENT_ID          || '',
  clientSecret:      process.env.GOOGLE_OAUTH_CLIENT_SECRET      || '',
  /** Retained ONLY so an old value in .env cannot break a build. Google
   *  retired developer tokens on 2026-09-09 and the Ads client no longer sends
   *  one — see ads.ts. Nothing reads this to decide whether Ads works. */
  adsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN      || '',
  /** Optional preselected account for the Ads panel. Accounts are discovered
   *  from Google at runtime (customers:listAccessibleCustomers), so this is a
   *  convenience default, never a requirement. */
  adsCustomerId:     process.env.GOOGLE_ADS_CUSTOMER_ID          || '',
  /** Only meaningful when the spending account is reached THROUGH a manager
   *  (MCC). Verified 2026-09-11: both accounts this grant can see are
   *  `manager: false`, so this must be EMPTY here — a login-customer-id that
   *  the user cannot access makes every query fail USER_PERMISSION_DENIED,
   *  which is exactly what the Ads tab was doing. The client now derives the
   *  header per account instead of trusting this blindly. */
  adsLoginCustomerId:process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID    || '',
  ga4PropertyId:     process.env.GA4_PROPERTY_ID                 || '',
  gscSiteUrl:        process.env.GSC_SITE_URL                    || '',
  tokenEncKey:       process.env.GOOGLE_TOKEN_ENC_KEY            || '',
  siteUrl:           process.env.NEXT_PUBLIC_SITE_URL            || 'https://www.dealeraddendums.com',
}

/** Digits only — Google Ads customer ids are written 123-456-7890 in the UI but
 *  the API wants 1234567890. Accept either so a pasted value works. */
export function normalizeCustomerId(id: string): string {
  return (id || '').replace(/[^0-9]/g, '')
}

/**
 * The full scope set the consent screen now offers (expanded 2026-09-11).
 *
 * `webmasters` (read/write) rather than `webmasters.readonly`: the consent
 * screen lists the broader one, and asking for a scope the screen does not
 * carry is what makes a consent attempt fail. Reads work under either.
 *
 * openid + email are what populate `account_email` on the status panel — the
 * existing grant has neither, which is why it shows no address.
 */
export const OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/indexing',
]

/** What each surface actually needs, so the UI can say "Ads works, Business
 *  Profile needs a reconnect" instead of one undifferentiated warning. */
export const SCOPES_BY_SURFACE: Record<string, string[]> = {
  ads: ['https://www.googleapis.com/auth/adwords'],
  ga4: ['https://www.googleapis.com/auth/analytics.readonly'],
  gsc: ['https://www.googleapis.com/auth/webmasters.readonly',
        'https://www.googleapis.com/auth/webmasters'],
  gbp: ['https://www.googleapis.com/auth/business.manage'],
  indexing: ['https://www.googleapis.com/auth/indexing'],
}

/**
 * Does a stored grant cover a surface? Satisfied by ANY of the listed scopes,
 * because `webmasters` is a superset of `webmasters.readonly` — an existing
 * grant holding only the readonly form still reads Search Console fine and
 * must not be reported as broken.
 */
export function surfaceGranted(surface: keyof typeof SCOPES_BY_SURFACE, granted: string[]): boolean {
  const need = SCOPES_BY_SURFACE[surface] || []
  return need.some(s => granted.includes(s))
}

/**
 * Scopes in the current request set that a stored grant does not have.
 *
 * Google only returns the scopes actually granted, and an existing connection
 * keeps whatever it was granted at consent time — adding scopes to the request
 * set does NOT retroactively widen an old grant. So this is what drives the
 * "Reconnect to grant new permissions" prompt.
 *
 * `webmasters.readonly` counts as covering `webmasters` so a pre-existing
 * connection is not nagged about a scope whose capability it already has.
 */
export function missingScopes(granted: string[]): string[] {
  const has = new Set(granted)
  if (has.has('https://www.googleapis.com/auth/webmasters.readonly')) {
    has.add('https://www.googleapis.com/auth/webmasters')
  }
  // Google reports these as profile-ish aliases; do not nag over identity scopes.
  const ignorable = new Set(['openid', 'email', 'profile'])
  return OAUTH_SCOPES.filter(s => !has.has(s) && !ignorable.has(s))
}

/** The redirect URI registered in the Google Cloud console. Must match byte for
 *  byte or Google rejects the exchange with redirect_uri_mismatch. */
export function oauthRedirectUri(): string {
  return `${googleEnv.siteUrl.replace(/\/$/, '')}/api/google/oauth/callback`
}

/** OAuth itself is configurable — the button is only offered when both halves
 *  of the client credential and an encryption key are present. Without the
 *  encryption key we could complete the handshake and then be unable to store
 *  the refresh token safely, so it counts as unconfigured. */
export const oauthConfigured = !!(
  googleEnv.clientId && googleEnv.clientSecret && googleEnv.tokenEncKey
)

export const ga4Configured = !!googleEnv.ga4PropertyId
/** Search Console needs no env var any more: the property is discovered from
 *  sites.list (see gsc.ts). GSC_SITE_URL is an optional override. */
export const gscConfigured = true
/**
 * Ads is configured as soon as OAuth is. No developer token (retired
 * 2026-09-09) and no customer id (accounts are discovered at runtime) — which
 * is why the Ads panel used to sit behind an "awaiting token" gate that could
 * never clear on its own.
 */
export const adsConfigured = oauthConfigured

export function missingEnvFor(surface: 'oauth' | 'ga4' | 'gsc' | 'ads'): string[] {
  const missing: string[] = []
  if (surface === 'oauth') {
    if (!googleEnv.clientId)     missing.push('GOOGLE_OAUTH_CLIENT_ID')
    if (!googleEnv.clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET')
    if (!googleEnv.tokenEncKey)  missing.push('GOOGLE_TOKEN_ENC_KEY')
  }
  if (surface === 'ga4' && !googleEnv.ga4PropertyId) missing.push('GA4_PROPERTY_ID')
  // gsc and ads have no required variables any more.
  return missing
}
