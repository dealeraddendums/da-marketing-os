'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, Btn, Card, inputStyle, timeAgo } from './ui'

export default function SettingsForm({
  initialUrl, gbpConnected, lastSync,
}: {
  initialUrl: string
  gbpConnected: boolean
  lastSync: string | null
}) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  async function saveUrl() {
    setSaving(true); setSavedMsg('')
    try {
      const res = await fetch('/api/reputation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_page_url: url }),
      })
      setSavedMsg(res.ok ? 'Saved.' : 'Save failed.')
    } catch { setSavedMsg('Save failed.') }
    setSaving(false)
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/reputation/gbp/sync', { method: 'POST' })
      const data = await res.json()
      setSyncMsg(res.ok ? `Synced ${data.count} reviews.` : (data.error || 'Sync failed.'))
      if (res.ok) router.refresh()
    } catch { setSyncMsg('Sync failed.') }
    setSyncing(false)
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Reputation Settings</h1>

      {/* Google connection */}
      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: '0 0 12px' }}>Google Connection</h2>
        {gbpConnected ? (
          <div style={{ fontSize: 14, color: C.success, fontWeight: 500 }}>● Connected to Google Business Profile</div>
        ) : (
          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '14px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e65100' }}>⏳ Pending API Access</div>
            <p style={{ fontSize: 13, color: '#8d6e00', margin: '6px 0 0', lineHeight: 1.6 }}>
              GBP API access request has been submitted to Google. Once approved, add credentials to <code style={{ background: '#fff3cd', padding: '1px 5px', borderRadius: 3 }}>.env.local</code> to activate live sync.
              In the meantime, <strong>mock reviews are active</strong> so the inbox and workflows are fully usable.
            </p>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Btn kind="secondary" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Now'}</Btn>
          <span style={{ fontSize: 13, color: C.textMuted }}>Last sync: {lastSync ? timeAgo(lastSync) : 'never'}</span>
          {syncMsg && <span style={{ fontSize: 13, color: C.textSecondary }}>{syncMsg}</span>}
        </div>
      </Card>

      {/* Review page URL */}
      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: '0 0 6px' }}>Google Review URL</h2>
        <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 12px' }}>
          The link the “😊 Share your experience on Google” button points to in review-request emails.
        </p>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://search.google.com/local/writereview?placeid=…" style={inputStyle} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Btn kind="primary" onClick={saveUrl} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          {savedMsg && <span style={{ fontSize: 13, color: C.textSecondary }}>{savedMsg}</span>}
        </div>
      </Card>

      {/* Email template preview */}
      <Card>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: '0 0 12px' }}>Campaign Email Preview</h2>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', maxWidth: 600 }}>
          <div style={{ background: C.navy, padding: '16px 24px' }}>
            <span style={{ background: C.orange, color: C.navy, fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.08em' }}>DA</span>
            <span style={{ color: '#fff', fontSize: 14, marginLeft: 10 }}>DealerAddendums</span>
          </div>
          <div style={{ padding: 28, fontSize: 14, color: C.textPrimary, lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 16px' }}>Hi [contact_name],</p>
            <p style={{ margin: '0 0 20px' }}>We'd love to hear how DealerAddendums has been working for <strong>[dealer_name]</strong>.</p>
            <span style={{ display: 'inline-block', background: C.blue, color: '#fff', fontWeight: 500, padding: '10px 18px', borderRadius: 4 }}>😊 Share your experience on Google</span>
            <p style={{ margin: '24px 0 8px', color: C.textSecondary }}>If something hasn't been right, we want to know first.</p>
            <span style={{ display: 'inline-block', background: '#fff', color: C.textPrimary, fontWeight: 500, padding: '10px 18px', borderRadius: 4, border: `1px solid ${C.border}` }}>Share private feedback</span>
            <p style={{ fontSize: 13, color: C.textSecondary, margin: '28px 0 0' }}>Thank you,<br />The DealerAddendums Team</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
