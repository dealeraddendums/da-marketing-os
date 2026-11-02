'use client'
// Admin → Hero Slides: manage the homepage hero slider.
// List with drag-to-reorder, add/edit/delete, image upload (server converts to
// WebP ≤ 300 KB), active toggle (max 4 active), and a live preview rendering
// the real HeroSlider component on the hero's navy background.
import { useCallback, useEffect, useRef, useState } from 'react'
import HeroSlider from '@/components/marketing/HeroSlider'

const C = {
  navy: '#2a2b3c',
  orange: '#ffa500',
  blue: '#1976d2',
  surface: '#ffffff',
  subtle: '#f5f6f7',
  text: '#333333',
  text2: '#55595c',
  muted: '#78828c',
  border: '#e0e0e0',
  error: '#d32f2f',
  success: '#4caf50',
}

const MAX_ACTIVE = 4
const TITLE_MAX = 60
const DESC_MAX = 200

interface Slide {
  id: string
  sort_order: number
  title: string
  description: string
  image_path: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface FormState {
  id: string | null // null = adding
  title: string
  description: string
  image_path: string
  is_active: boolean
}

const emptyForm: FormState = { id: null, title: '', description: '', image_path: '', is_active: true }

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: "'Roboto', sans-serif",
  color: C.text,
  background: C.surface,
  outline: 'none',
  boxSizing: 'border-box',
}

const btn = (bg: string, fg = '#fff'): React.CSSProperties => ({
  background: bg,
  color: fg,
  border: 'none',
  borderRadius: 4,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: "'Roboto', sans-serif",
})

const btnGhost: React.CSSProperties = {
  background: 'none',
  color: C.text2,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: '7px 14px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: "'Roboto', sans-serif",
}

export default function HeroSlidesAdmin() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/hero-slides')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load slides')
      setSlides(data.slides)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load slides')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const flash = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 3500)
  }

  const activeSlides = slides.filter(s => s.is_active)

  // ── Writes ────────────────────────────────────────────────────────────────
  const saveForm = async () => {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const isEdit = !!form.id
      const res = await fetch(isEdit ? `/api/hero-slides/${form.id}` : '/api/hero-slides', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          image_path: form.image_path,
          is_active: form.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setForm(null)
      await load()
      flash(isEdit ? 'Slide updated — live within a minute.' : 'Slide added — live within a minute.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
    setSaving(false)
  }

  const toggleActive = async (s: Slide) => {
    setError('')
    const res = await fetch(`/api/hero-slides/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Update failed'); return }
    await load()
    flash(!s.is_active ? 'Slide activated.' : 'Slide deactivated.')
  }

  const deleteSlide = async (id: string) => {
    setError('')
    const res = await fetch(`/api/hero-slides/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Delete failed'); return }
    setConfirmDeleteId(null)
    await load()
    flash('Slide deleted.')
  }

  const persistOrder = async (ordered: Slide[]) => {
    setSlides(ordered) // optimistic
    const res = await fetch('/api/hero-slides/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map(s => s.id) }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Reorder failed')
      await load()
    } else {
      flash('Order saved.')
    }
  }

  const onDrop = (toIdx: number) => {
    const fromIdx = dragFrom.current
    dragFrom.current = null
    setDragOver(null)
    if (fromIdx == null || fromIdx === toIdx) return
    const next = [...slides]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    void persistOrder(next)
  }

  const uploadImage = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/hero-slides/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setForm(f => (f ? { ...f, image_path: data.path } : f))
      flash(`Image uploaded (${Math.round(data.bytes / 1024)} KB WebP).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    }
    setUploading(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gap: 20, fontFamily: "'Roboto', sans-serif", color: C.text }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Hero Slides</h2>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            The homepage hero slider. Up to {MAX_ACTIVE} active slides ({activeSlides.length} active now).
            Edits go live within a minute — no redeploy.
          </p>
        </div>
        <button
          style={btn(C.blue)}
          onClick={() => { setForm({ ...emptyForm, is_active: activeSlides.length < MAX_ACTIVE }); setError('') }}
        >
          + Add Slide
        </button>
      </div>

      {notice && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 4, padding: '8px 12px', fontSize: 13, color: '#2e7d32' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: 4, padding: '8px 12px', fontSize: 13, color: C.error }}>
          {error}
        </div>
      )}

      {/* Add / Edit panel */}
      {form && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>
            {form.id ? 'Edit slide' : 'New slide'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
            {/* Image upload + preview */}
            <div>
              <div style={{
                width: 200,
                aspectRatio: '760 / 1968',
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                background: C.subtle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {form.image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.image_path} alt="Slide preview" style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />
                ) : (
                  <span style={{ fontSize: 12, color: C.muted, padding: 12, textAlign: 'center' }}>No image yet</span>
                )}
              </div>
              <label style={{ ...btnGhost, display: 'inline-block', marginTop: 10, opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Converting…' : (form.image_path ? 'Replace image' : 'Upload image')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) void uploadImage(f)
                    e.target.value = ''
                  }}
                />
              </label>
              <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>
                PNG, JPG or WebP — converted to WebP ≤ 300 KB automatically.
              </p>
            </div>

            {/* Fields */}
            <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text2, marginBottom: 5 }}>
                  Title <span style={{ color: C.muted, fontWeight: 400 }}>({form.title.length}/{TITLE_MAX})</span>
                </label>
                <input
                  style={inputStyle}
                  value={form.title}
                  maxLength={TITLE_MAX}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Required products, one price"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text2, marginBottom: 5 }}>
                  Description <span style={{ color: C.muted, fontWeight: 400 }}>({form.description.length}/{DESC_MAX})</span>
                </label>
                <textarea
                  style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                  value={form.description}
                  maxLength={DESC_MAX}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Short description shown beside the image."
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text2 }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                />
                Active (shown on the homepage)
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  style={{ ...btn(C.success), opacity: saving || uploading ? 0.6 : 1 }}
                  disabled={saving || uploading}
                  onClick={() => void saveForm()}
                >
                  {saving ? 'Saving…' : (form.id ? 'Save changes' : 'Add slide')}
                </button>
                <button style={btnGhost} onClick={() => { setForm(null); setError('') }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide list */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6 }}>
        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: C.muted }}>Loading slides…</div>
        ) : slides.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: C.muted }}>
            No slides yet — the homepage shows its built-in image pair until a slide is added.
          </div>
        ) : (
          slides.map((s, i) => (
            <div
              key={s.id}
              draggable
              onDragStart={() => { dragFrom.current = i }}
              onDragOver={e => { e.preventDefault(); setDragOver(i) }}
              onDragLeave={() => setDragOver(cur => (cur === i ? null : cur))}
              onDrop={() => onDrop(i)}
              onDragEnd={() => { dragFrom.current = null; setDragOver(null) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderBottom: i < slides.length - 1 ? `1px solid ${C.border}` : 'none',
                borderTop: dragOver === i ? `2px solid ${C.blue}` : '2px solid transparent',
                background: C.surface,
              }}
            >
              <span title="Drag to reorder" style={{ cursor: 'grab', color: C.muted, fontSize: 16, userSelect: 'none' }}>⠿</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image_path}
                alt=""
                style={{ width: 34, height: 86, objectFit: 'contain', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.description}
                </div>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 4,
                background: s.is_active ? 'rgba(76,175,80,0.12)' : C.subtle,
                color: s.is_active ? '#2e7d32' : C.muted,
                letterSpacing: '0.04em',
              }}>
                {s.is_active ? 'ACTIVE' : 'OFF'}
              </span>
              <button style={btnGhost} onClick={() => void toggleActive(s)}>
                {s.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button style={btnGhost} onClick={() => { setForm({ id: s.id, title: s.title, description: s.description, image_path: s.image_path, is_active: s.is_active }); setError(''); window.scrollTo({ top: 0 }) }}>
                Edit
              </button>
              {confirmDeleteId === s.id ? (
                <span style={{ display: 'inline-flex', gap: 6 }}>
                  <button style={btn(C.error)} onClick={() => void deleteSlide(s.id)}>Confirm delete</button>
                  <button style={btnGhost} onClick={() => setConfirmDeleteId(null)}>Keep</button>
                </span>
              ) : (
                <button style={{ ...btnGhost, color: C.error, borderColor: '#f5c6cb' }} onClick={() => setConfirmDeleteId(s.id)}>
                  Delete
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Live preview — the real HeroSlider on the hero's navy background */}
      {activeSlides.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Live preview</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px' }}>
            Exactly the component the homepage renders, with the active slides in their saved order.
          </p>
          <div style={{ background: C.navy, borderRadius: 6, padding: '32px 28px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 520, maxWidth: '100%' }}>
              <HeroSlider key={activeSlides.map(s => s.id + s.updated_at).join('|')} slides={activeSlides} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
