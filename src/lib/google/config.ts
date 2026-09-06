// Google integration — environment + capability flags.
//
// Phase 1 is read-only. Nothing here mutates a Google account; the Ads client
// deliberately exposes no write surface at all (see ads.ts).
//
// Every surface degrades independently: GA4 and Search Console work on OAuth
// alone, while Ads additionally needs a developer token that Google approves
// separately and may not have issued yet. A missing variable must always
// produce a "not connected" panel, never a crash — so callers read these flags
// rather than assuming the values exist.

export const googleEnv = {
  clientId:          process.env.GOOGLE_OAUTH_CLIENT_ID          || '',
  clientSecret:      process.env.GOOGLE_OAUTH_CLIENT_SECRET      || '',
  adsDeveloperToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN      || '',
  adsCustomerId:     process.env.GOOGLE_ADS_CUSTOMER_ID          || '',
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

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
]

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
export const gscConfigured = !!googleEnv.gscSiteUrl
/** Ads needs BOTH the developer token (pending Google approval) and a customer
 *  id. Reported separately so the panel can say which half is missing. */
export const adsConfigured = !!(googleEnv.adsDeveloperToken && googleEnv.adsCustomerId)

export function missingEnvFor(surface: 'oauth' | 'ga4' | 'gsc' | 'ads'): string[] {
  const missing: string[] = []
  if (surface === 'oauth') {
    if (!googleEnv.clientId)     missing.push('GOOGLE_OAUTH_CLIENT_ID')
    if (!googleEnv.clientSecret) missing.push('GOOGLE_OAUTH_CLIENT_SECRET')
    if (!googleEnv.tokenEncKey)  missing.push('GOOGLE_TOKEN_ENC_KEY')
  }
  if (surface === 'ga4' && !googleEnv.ga4PropertyId) missing.push('GA4_PROPERTY_ID')
  if (surface === 'gsc' && !googleEnv.gscSiteUrl)    missing.push('GSC_SITE_URL')
  if (surface === 'ads') {
    if (!googleEnv.adsDeveloperToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN')
    if (!googleEnv.adsCustomerId)     missing.push('GOOGLE_ADS_CUSTOMER_ID')
  }
  return missing
}
