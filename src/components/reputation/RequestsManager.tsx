'use client'
import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, Btn, StatusBadge, Card, inputStyle, timeAgo } from './ui'

export interface CampaignRow {
  id: string
  name: string
  segment: string | null
  total_sent: number
  total_opened: number
  total_clicked_positive: number
  total_clicked_negative: number
  total_reviewed: number
  sent_at: string | null
  created_at: string
}

export interface RequestRow {
  id: string
  campaign_id: string | null
  dealer_name: string
  contact_email: string
  status: string
  sent_at: string | null
}

const SEGMENTS = [
  { value: 'active_90_days', label: 'Active 90+ days, no review yet' },
  { value: 'all_active', label: 'All active dealers' },
  { value: 'manual', label: 'Manual CSV / email paste' },
]

export default function RequestsManager({
  campaigns, requestsByCampaign,
}: {
  campaigns: CampaignRow[]
  requestsByCampaign: Record<string, RequestRow[]>
}) {
  const router = useRouter()
  const [segment, setSegment] = useState('active_90_days')
  const [name, setName] = useState('')
  const [manualText, setManualText] = useState('')
  const [preview, setPreview] = useState<{ count: number; note?: string; connected: boolean } | null>(null)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Preview count whenever the segment (or manual text) changes.
  useEffect(() => {
    let cancelled = false
    if (segment === 'manual') {
      const count = manualText.split(/\r?\n/).map(l => l.trim()).filter(l => /@/.test(l)).length
      setPreview({ count, connected: true })
      return
    }
    fetch(`/api/reputation/requests/preview?segment=${segment}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setPreview(d) })
      .catch(() => { if (!cancelled) setPreview(null) })
    return () => { cancelled = true }
  }, [segment, manualText])

  async function send() {
    setSending(true); setMsg('')
    try {
      const res = await fetch('/api/reputation/requests/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, segment, manualText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg(`Sent ${data.sent} of ${data.recipients} requests.`)
      setName(''); setManualText('')
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Send failed.')
    }
    setSending(false)
  }

  const canSend = !!name.trim() && !sending && (preview?.count ?? 0) > 0

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Review Requests</h1>

      {/* Send new campaign */}
      <Card style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: '0 0 14px' }}>Send New Campaign</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <div style={{ flex: '1 1 280px' }}>
            <label style={labelStyle}>Segment</label>
            <select value={segment} onChange={e => setSegment(e.target.value)} style={inputStyle}>
              {SEGMENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 280px' }}>
            <label style={labelStyle}>Campaign name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. June review push" style={inputStyle} />
          </div>
        </div>

        {segment === 'manual' && (
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Paste recipients — one per line: <span style={{ color: C.textMuted }}>email</span> or <span style={{ color: C.textMuted }}>email, dealer name, contact name</span></label>
            <textarea
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              rows={5}
              placeholder={'jane@dealer.com, Smith Ford, Jane\nmike@autogroup.com'}
              style={{ ...inputStyle, height: 'auto', padding: 12, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Btn kind="primary" onClick={send} disabled={!canSend}>{sending ? 'Sending…' : 'Send Campaign'}</Btn>
          <span style={{ fontSize: 13, color: C.textSecondary }}>
            {preview ? `This will send to ${preview.count} ${preview.count === 1 ? 'dealer' : 'dealers'}.` : 'Calculating…'}
          </span>
        </div>
        {preview?.note && <p style={{ fontSize: 12, color: C.warning, margin: '8px 0 0' }}>{preview.note}</p>}
        {msg && <p style={{ fontSize: 13, color: C.textPrimary, margin: '8px 0 0' }}>{msg}</p>}
      </Card>

      {/* Campaign history */}
      <Card>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: '0 0 12px' }}>Campaign History</h2>
        {campaigns.length === 0 && <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>No campaigns sent yet.</p>}
        {campaigns.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textMuted, fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={thStyle}>Campaign</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Sent</th>
                  <th style={thStyle}>Opened</th>
                  <th style={thStyle}>👍</th>
                  <th style={thStyle}>👎</th>
                  <th style={thStyle}>Conv.</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const conv = c.total_sent ? Math.round((c.total_clicked_positive / c.total_sent) * 100) : 0
                  const reqs = requestsByCampaign[c.id] || []
                  const isOpen = expanded === c.id
                  return (
                    <Fragment key={c.id}>
                      <tr style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={tdStyle}>{c.name}</td>
                        <td style={tdStyle}>{c.sent_at ? timeAgo(c.sent_at) : '—'}</td>
                        <td style={tdStyle}>{c.total_sent}</td>
                        <td style={tdStyle}>{c.total_opened}</td>
                        <td style={tdStyle}>{c.total_clicked_positive}</td>
                        <td style={tdStyle}>{c.total_clicked_negative}</td>
                        <td style={tdStyle}>{conv}%</td>
                        <td style={tdStyle}>
                          <button onClick={() => setExpanded(isOpen ? null : c.id)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 13 }}>
                            {isOpen ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ background: C.bgSubtle, padding: 12 }}>
                            {reqs.length === 0 && <span style={{ fontSize: 13, color: C.textMuted }}>No recipient rows.</span>}
                            {reqs.map(r => (
                              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', fontSize: 13 }}>
                                <span style={{ width: 200, fontWeight: 500 }}>{r.dealer_name}</span>
                                <span style={{ flex: 1, color: C.textMuted }}>{r.contact_email}</span>
                                <StatusBadge status={r.status} />
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 500, color: C.textSecondary, marginBottom: 6 }
const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 500 }
const tdStyle: React.CSSProperties = { padding: '10px', color: C.textPrimary }
