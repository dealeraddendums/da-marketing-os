'use client'
import { useState } from 'react'
import { C, Btn, inputStyle } from './ui'

export default function FeedbackForm({ requestId }: { requestId: string }) {
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!feedback.trim()) return
    setSubmitting(true); setErr('')
    try {
      const res = await fetch('/api/reputation/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, feedback }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong — please try again.')
    }
    setSubmitting(false)
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🙏</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: C.textPrimary, margin: '0 0 8px' }}>Thank you</h1>
        <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>
          We've received your feedback and someone from our team will be in touch shortly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: C.textPrimary, margin: '0 0 8px' }}>
        We're sorry to hear that.
      </h1>
      <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: '0 0 16px' }}>
        Tell us what's going on — your feedback comes straight to our team, privately.
      </p>
      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        rows={6}
        placeholder="What happened?"
        autoFocus
        style={{ ...inputStyle, height: 'auto', padding: 12, resize: 'vertical', lineHeight: 1.5 }}
      />
      {err && <p style={{ fontSize: 12, color: C.error, margin: '8px 0 0' }}>{err}</p>}
      <div style={{ marginTop: 16 }}>
        <Btn type="submit" kind="primary" disabled={submitting || !feedback.trim()} style={{ width: '100%' }}>
          {submitting ? 'Sending…' : 'Send Feedback'}
        </Btn>
      </div>
    </form>
  )
}
