'use client'
import React from 'react'

// DA design tokens (mirrors DADesignGuidelines.md). Kept here so client components
// don't import the server-only lib/reputation module.
export const C = {
  navy: '#2a2b3c',
  orange: '#ffa500',
  blue: '#1976d2',
  blueLight: '#2196f3',
  success: '#4caf50',
  error: '#ff5252',
  warning: '#ff9800',
  bgApp: '#3a6897',
  bgSurface: '#ffffff',
  bgSubtle: '#f5f6f7',
  textPrimary: '#333333',
  textSecondary: '#55595c',
  textMuted: '#78828c',
  border: '#e0e0e0',
  borderStrong: '#c0c0c0',
} as const

export const STAR_NUM: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

export function starNum(rating?: string | null): number {
  if (!rating) return 0
  return STAR_NUM[rating] ?? 0
}

export function Stars({ rating, size = 16 }: { rating: string | number | null | undefined; size?: number }) {
  const n = typeof rating === 'number' ? rating : starNum(rating)
  return (
    <span style={{ color: C.orange, fontSize: size, letterSpacing: 1, whiteSpace: 'nowrap' }} aria-label={`${n} of 5 stars`}>
      {'★'.repeat(n)}
      <span style={{ color: C.border }}>{'★'.repeat(5 - n)}</span>
    </span>
  )
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  unread: { bg: '#eceff1', color: '#55595c', label: 'Unread' },
  read: { bg: '#e3f2fd', color: '#1976d2', label: 'Read' },
  replied: { bg: '#e8f5e9', color: '#2e7d32', label: 'Replied' },
  flagged: { bg: '#fff3e0', color: '#e65100', label: 'Flagged' },
  pending: { bg: '#eceff1', color: '#55595c', label: 'Pending' },
  sent: { bg: '#e3f2fd', color: '#1976d2', label: 'Sent' },
  opened: { bg: '#ede7f6', color: '#5e35b1', label: 'Opened' },
  clicked_positive: { bg: '#e8f5e9', color: '#2e7d32', label: 'Clicked 😊' },
  clicked_negative: { bg: '#fff3e0', color: '#e65100', label: 'Clicked feedback' },
  reviewed: { bg: '#e8f5e9', color: '#2e7d32', label: 'Reviewed' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || { bg: '#eceff1', color: '#55595c', label: status }
  return (
    <span style={{
      display: 'inline-block', background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 20, ...style }}>
      {children}
    </div>
  )
}

export function StatCard({ label, value, accent, hint }: { label: string; value: React.ReactNode; accent?: boolean; hint?: string }) {
  return (
    <div style={{
      background: C.bgSurface, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: '16px 18px', flex: '1 1 150px', minWidth: 150,
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: accent ? C.orange : C.textPrimary, marginTop: 6, lineHeight: 1.1 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

type BtnKind = 'primary' | 'success' | 'danger' | 'orange' | 'secondary'
const BTN: Record<BtnKind, React.CSSProperties> = {
  primary: { background: C.blue, color: '#fff', border: 'none' },
  success: { background: C.success, color: '#fff', border: 'none' },
  danger: { background: C.error, color: '#fff', border: 'none' },
  orange: { background: C.orange, color: C.navy, border: 'none' },
  secondary: { background: '#fff', color: C.textPrimary, border: `1px solid ${C.border}` },
}

export function Btn({
  children, kind = 'primary', onClick, disabled, type = 'button', style,
}: {
  children: React.ReactNode
  kind?: BtnKind
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  style?: React.CSSProperties
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 36, padding: '0 16px', borderRadius: 4, fontSize: 14, fontWeight: 500,
        fontFamily: "'Roboto', sans-serif", cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1, ...BTN[kind], ...style,
      }}
    >
      {children}
    </button>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, border: `1px solid ${C.border}`, borderRadius: 4,
  padding: '0 12px', fontSize: 14, fontFamily: "'Roboto', sans-serif",
  color: C.textPrimary, background: C.bgSurface, outline: 'none', boxSizing: 'border-box',
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return d.toLocaleDateString()
}
