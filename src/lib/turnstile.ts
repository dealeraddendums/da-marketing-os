// Cloudflare Turnstile server-side verification.
//
// /api/leads calls verifyTurnstile() BEFORE any insert/provisioning. When
// TURNSTILE_SECRET_KEY is unset (local/dev) verification is skipped so signups
// still work without keys — matches the inert-when-unset pattern used for the
// other optional integrations. In production both keys are set, so a missing or
// failed token is rejected.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string | null,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: true, skipped: true } // not configured → don't block (dev)

  if (!token) return { ok: false, error: 'missing-token' }

  try {
    const form = new URLSearchParams()
    form.set('secret', secret)
    form.set('response', token)
    if (ip) form.set('remoteip', ip)

    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (data.success) return { ok: true }
    return { ok: false, error: (data['error-codes'] ?? ['verification-failed']).join(',') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'siteverify-error' }
  }
}
