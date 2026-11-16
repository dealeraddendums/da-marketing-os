// LinkedIn integration — environment + capability flags.
//
// Member-profile posting ONLY. The app was approved for "Sign In with LinkedIn
// using OpenID Connect" + "Share on LinkedIn" — NOT the Community Management
// API — so there is no organization scope and nothing here can act as the
// DealerAddendums company page. Resharing a member post to the page is a
// manual step (the Social Queue says so on posted items).
//
// Secrets are read here and NEVER logged or echoed back to the browser.

export const linkedinEnv = {
  clientId:     process.env.LINKEDIN_CLIENT_ID     || '',
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  /** Dedicated key wins; otherwise the LinkedIn tokens are sealed with the
   *  same 32-byte key the Google refresh token uses. Either way the key lives
   *  only in the environment — a database dump yields ciphertext. */
  tokenEncKey:  process.env.LINKEDIN_TOKEN_ENC_KEY || process.env.GOOGLE_TOKEN_ENC_KEY || '',
  /** The human gate behind the human gate: while false, Approve composes the
   *  rest/posts payload and shows it in the admin as a dry-run — the LinkedIn
   *  API is never called. */
  postingEnabled: process.env.LINKEDIN_POSTING_ENABLED === 'true',
  siteUrl:      process.env.NEXT_PUBLIC_SITE_URL || 'https://www.dealeraddendums.com',
}

/** Member-profile scopes only — no organization scope, by decision. */
export const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social']

/** Must match the redirect URL registered in the LinkedIn developer app,
 *  byte for byte: https://www.dealeraddendums.com/api/linkedin/oauth/callback */
export function linkedinRedirectUri(): string {
  return `${linkedinEnv.siteUrl.replace(/\/$/, '')}/api/linkedin/oauth/callback`
}

export const linkedinConfigured = !!(
  linkedinEnv.clientId && linkedinEnv.clientSecret && linkedinEnv.tokenEncKey
)

export function linkedinMissingEnv(): string[] {
  const missing: string[] = []
  if (!linkedinEnv.clientId)     missing.push('LINKEDIN_CLIENT_ID')
  if (!linkedinEnv.clientSecret) missing.push('LINKEDIN_CLIENT_SECRET')
  if (!linkedinEnv.tokenEncKey)  missing.push('LINKEDIN_TOKEN_ENC_KEY or GOOGLE_TOKEN_ENC_KEY')
  return missing
}

/**
 * LinkedIn-Version header for the versioned REST API: the current month as
 * YYYYMM (LinkedIn cuts a version monthly and keeps each live for a year).
 * `monthsBack` exists for the one edge where the current month's version is
 * not released yet — the poster retries once with the previous month.
 */
export function linkedinVersion(monthsBack = 0): string {
  const d = new Date()
  d.setUTCDate(1) // avoid day-of-month overflow when stepping months
  d.setUTCMonth(d.getUTCMonth() - monthsBack)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
