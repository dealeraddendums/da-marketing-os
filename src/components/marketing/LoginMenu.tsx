'use client'
import { useEffect, useRef, useState } from 'react'

// Header login chooser. Wording lives here so Allan can refine labels in one place.
const LOGIN_OPTIONS = [
  {
    label: 'New platform customers',
    sub: 'Log in to Platform 5.0',
    href: 'https://app.dealeraddendums.com/login',
  },
  {
    label: 'Classic platform customers',
    sub: 'Log in to Platform 4.0',
    href: 'https://dealeraddendums.com/app/login',
  },
  {
    label: 'New to DealerAddendums?',
    sub: 'Start your free trial',
    // Absolute so it works from blog/LP pages (no same-page #signup there) —
    // always lands on the homepage free-trial form (CTASection id="signup").
    href: '/#signup',
  },
]

interface Props {
  // dark = navy header (white trigger text), light = white header (grey text)
  variant?: 'dark' | 'light'
  // Override the trigger text/look (e.g. the hero's link-styled trigger)
  triggerLabel?: string
  triggerStyle?: React.CSSProperties
  // Which trigger edge the popover hangs from
  align?: 'left' | 'right'
}

export default function LoginMenu({
  variant = 'dark',
  triggerLabel = 'Log In',
  triggerStyle,
  align = 'right',
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const triggerColor = variant === 'dark' ? 'rgba(255,255,255,0.8)' : '#555555'
  const triggerHover = variant === 'dark' ? '#ffffff' : '#1976d2'

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: 'none',
          border: 'none',
          padding: '6px 14px',
          fontSize: 14,
          fontFamily: "'Roboto', sans-serif",
          color: triggerColor,
          borderRadius: 4,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          ...triggerStyle,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = triggerHover)}
        onMouseLeave={e => (e.currentTarget.style.color = triggerColor)}
      >
        {triggerLabel}
        <span aria-hidden="true" style={{ fontSize: 9, lineHeight: 1 }}>▼</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            ...(align === 'right' ? { right: 0 } : { left: 0 }),
            background: '#ffffff',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            minWidth: 230,
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 14px',
            fontSize: 11,
            fontWeight: 700,
            color: '#78828c',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            borderBottom: '1px solid #e0e0e0',
            background: '#f5f6f7',
          }}>
            Log in or sign up
          </div>
          {LOGIN_OPTIONS.map(opt => (
            <a
              key={opt.label}
              role="menuitem"
              href={opt.href}
              style={{
                display: 'block',
                padding: '10px 14px',
                textDecoration: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f6f7')}
              onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#333333' }}>
                {opt.label}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: '#78828c', marginTop: 2 }}>
                {opt.sub}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
