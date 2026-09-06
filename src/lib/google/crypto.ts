// AES-256-GCM for the Google refresh token at rest.
//
// The token is a long-lived credential to Allan's Ads/Analytics/Search Console
// accounts, so it is encrypted with a key that lives only in the environment.
// A Supabase dump therefore yields ciphertext, not a working credential.
//
// GCM (not CBC) so the ciphertext is authenticated: a tampered row fails to
// decrypt loudly instead of silently producing garbage that we would then send
// to Google.

import crypto from 'crypto'
import { googleEnv } from './config'

export interface Sealed {
  ciphertext: string  // base64
  iv: string          // base64, 12 bytes
  tag: string         // base64, 16 bytes
}

/** Accepts the key as base64 or hex, and requires it to decode to 32 bytes —
 *  a short key would otherwise be silently padded by some implementations and
 *  weaken the cipher without any visible symptom. */
function key(): Buffer {
  const raw = googleEnv.tokenEncKey
  if (!raw) throw new Error('GOOGLE_TOKEN_ENC_KEY is not set')
  let buf: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex')
  else buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error(
      `GOOGLE_TOKEN_ENC_KEY must decode to 32 bytes (got ${buf.length}). ` +
      'Generate one with: openssl rand -base64 32'
    )
  }
  return buf
}

export function seal(plaintext: string): Sealed {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

export function open(sealed: Sealed): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', key(), Buffer.from(sealed.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
