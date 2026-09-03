'use client'

import { useState } from 'react'

export default function ConfirmButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/leads/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const json = (await res.json()) as { error?: string; message?: string }
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
      setDone(json.message ?? "You're all set.")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#2e7d32', margin: 0 }}>{done}</p>
        <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>
          Questions? <a href="mailto:support@dealeraddendums.com">support@dealeraddendums.com</a>
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      {error && <p style={{ color: '#c62828', fontSize: 13 }}>{error}</p>}
      <button type="button" onClick={() => void confirm()} disabled={busy}
        style={{ background: '#1976d2', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 4, fontWeight: 600, fontSize: 15, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
        {busy ? 'Setting up your account…' : 'Confirm my email'}
      </button>
    </div>
  )
}
