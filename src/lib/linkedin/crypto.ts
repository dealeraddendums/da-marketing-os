// AES-256-GCM for the LinkedIn tokens at rest — same construction as
// src/lib/google/crypto.ts (GCM so a tampered row fails loudly), but keyed by
// LINKEDIN_TOKEN_ENC_KEY with GOOGLE_TOKEN_ENC_KEY as the fallback (see
// linkedinEnv.tokenEncKey). Kept as its own module rather than importing the
// Google one because that module reads googleEnv directly.

import crypto from 'crypto'
import { linkedinEnv } from './config'

export interface Sealed {
  ciphertext: string  // base64
  iv: string          // base64, 12 bytes
  tag: string         // base64, 16 bytes
}

/** Accepts the key as base64 or hex, and requires it to decode to 32 bytes. */
function key(): Buffer {
  const raw = linkedinEnv.tokenEncKey
  if (!raw) throw new Error('LINKEDIN_TOKEN_ENC_KEY (or GOOGLE_TOKEN_ENC_KEY) is not set')
  let buf: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex')
  else buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error(
      `LinkedIn token encryption key must decode to 32 bytes (got ${buf.length}). ` +
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
