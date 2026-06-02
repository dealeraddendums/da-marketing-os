'use client'
import { useMemo, useState } from 'react'
import { C, Stars, StatusBadge, Btn, starNum, timeAgo, inputStyle } from './ui'

export interface Review {
  id: string
  review_id: string
  reviewer_name: string | null
  reviewer_photo_url: string | null
  star_rating: string | null
  comment: string | null
  create_time: string | null
  reply_comment: string | null
  status: string
  ai_draft: string | null
}

type Filter = 'all' | 'unanswered' | 'negative' | 'replied'
type Sort = 'newest' | 'oldest' | 'lowest'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'negative', label: 'Negative (1–3★)' },
  { key: 'replied', label: 'Replied' },
]

export default function ReviewInbox({ initialReviews }: { initialReviews: Review[] }) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [openId, setOpenId] = useState<string | null>(null)

  const visible = useMemo(() => {
    let list = [...reviews]
    if (filter === 'unanswered') list = list.filter(r => !r.reply_comment && r.status !== 'replied')
    else if (filter === 'negative') list = list.filter(r => starNum(r.star_rating) > 0 && starNum(r.star_rating) <= 3)
    else if (filter === 'replied') list = list.filter(r => r.reply_comment || r.status === 'replied')
    list.sort((a, b) => {
      if (sort === 'lowest') return starNum(a.star_rating) - starNum(b.star_rating)
      const ta = a.create_time ? new Date(a.create_time).getTime() : 0
      const tb = b.create_time ? new Date(b.create_time).getTime() : 0
      return sort === 'oldest' ? ta - tb : tb - ta
    })
    return list
  }, [reviews, filter, sort])

  const selected = reviews.find(r => r.id === openId) || null

  function patchLocal(reviewId: string, patch: Partial<Review>) {
    setReviews(prev => prev.map(r => (r.review_id === reviewId ? { ...r, ...patch } : r)))
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Review Inbox</h1>

      {/* Filter + sort bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              height: 32, padding: '0 12px', borderRadius: 4, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: "'Roboto', sans-serif",
              border: filter === f.key ? 'none' : `1px solid ${C.border}`,
              background: filter === f.key ? C.orange : '#fff',
              color: filter === f.key ? C.navy : C.textSecondary,
            }}
          >
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as Sort)}
          style={{ ...inputStyle, width: 'auto', height: 32, padding: '0 8px' }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="lowest">Lowest rated</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bgSubtle, fontSize: 12, fontWeight: 500, color: C.textMuted, textTransform: 'uppercase' }}>
          <div style={{ width: 110 }}>Stars</div>
          <div style={{ width: 150 }}>Reviewer</div>
          <div style={{ width: 90 }}>Date</div>
          <div style={{ flex: 1 }}>Review</div>
          <div style={{ width: 130 }}>Status</div>
        </div>
        {visible.length === 0 && (
          <div style={{ padding: 24, fontSize: 14, color: C.textMuted }}>No reviews match this filter.</div>
        )}
        {visible.map(r => (
          <div
            key={r.id}
            onClick={() => setOpenId(r.id)}
            style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 14, color: C.textPrimary }}
          >
            <div style={{ width: 110 }}><Stars rating={r.star_rating} size={14} /></div>
            <div style={{ width: 150, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{r.reviewer_name}</div>
            <div style={{ width: 90, color: C.textMuted, fontSize: 13 }}>{timeAgo(r.create_time)}</div>
            <div style={{ flex: 1, color: C.textSecondary, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{r.comment}</div>
            <div style={{ width: 130 }}><StatusBadge status={r.status} /></div>
          </div>
        ))}
      </div>

      {selected && (
        <SlideOver review={selected} onClose={() => setOpenId(null)} patchLocal={patchLocal} />
      )}
    </div>
  )
}

function SlideOver({
  review, onClose, patchLocal,
}: {
  review: Review
  onClose: () => void
  patchLocal: (reviewId: string, patch: Partial<Review>) => void
}) {
  const [draft, setDraft] = useState(review.reply_comment || review.ai_draft || '')
  const [streaming, setStreaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function draftWithAI() {
    setStreaming(true)
    setErr('')
    setDraft('')
    try {
      const res = await fetch('/api/reputation/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: review.review_id,
          reviewText: review.comment,
          starRating: review.star_rating,
          reviewerName: review.reviewer_name,
        }),
      })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setDraft(acc)
      }
      patchLocal(review.review_id, { ai_draft: acc })
    } catch {
      setErr('Could not generate a draft. Please try again.')
    }
    setStreaming(false)
  }

  async function postReply() {
    if (!draft.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/reputation/gbp/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.review_id, comment: draft.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      patchLocal(review.review_id, { reply_comment: draft.trim(), status: 'replied' })
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to post reply.')
    }
    setBusy(false)
  }

  async function deleteReply() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/reputation/gbp/reply', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.review_id }),
      })
      if (!res.ok) throw new Error('Failed to delete reply.')
      patchLocal(review.review_id, { reply_comment: null, status: 'read' })
      setDraft('')
    } catch {
      setErr('Failed to delete reply.')
    }
    setBusy(false)
  }

  async function setStatus(status: string) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/reputation/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId: review.review_id, status }),
      })
      if (!res.ok) throw new Error()
      patchLocal(review.review_id, { status })
    } catch {
      setErr('Could not update status.')
    }
    setBusy(false)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,43,60,0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', height: '100%', background: '#fff', overflowY: 'auto', boxSizing: 'border-box', padding: 24 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <Stars rating={review.star_rating} size={18} />
            <div style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, marginTop: 6 }}>{review.reviewer_name}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{review.create_time ? new Date(review.create_time).toLocaleDateString() : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: C.textMuted, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginBottom: 8 }}><StatusBadge status={review.status} /></div>

        <p style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.6, background: C.bgSubtle, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          {review.comment}
        </p>

        {review.reply_comment && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Current Reply</div>
            <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0, borderLeft: `3px solid ${C.success}`, paddingLeft: 12 }}>{review.reply_comment}</p>
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: C.textSecondary }}>Your Reply</label>
          <Btn kind="secondary" onClick={draftWithAI} disabled={streaming} style={{ height: 30, fontSize: 13 }}>
            {streaming ? 'Drafting…' : '✨ Draft with AI'}
          </Btn>
        </div>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={6}
          placeholder="Write a reply, or let AI draft one…"
          style={{ ...inputStyle, height: 'auto', padding: 12, resize: 'vertical', lineHeight: 1.5 }}
        />

        {err && <p style={{ fontSize: 12, color: C.error, margin: '8px 0 0' }}>{err}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <Btn kind="primary" onClick={postReply} disabled={busy || streaming || !draft.trim()}>
            {review.reply_comment ? 'Update Reply' : 'Post Reply'}
          </Btn>
          {review.reply_comment && (
            <Btn kind="secondary" onClick={deleteReply} disabled={busy}>Remove Reply</Btn>
          )}
          <Btn kind="secondary" onClick={() => setStatus('flagged')} disabled={busy}>Flag Review</Btn>
          <Btn kind="secondary" onClick={() => setStatus('read')} disabled={busy}>Mark as Read</Btn>
        </div>
      </div>
    </div>
  )
}
