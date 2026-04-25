'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const DashboardWrapper = dynamic(() => import('@/components/admin/DashboardWrapper'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#3a6897',
      fontFamily: "'Roboto', sans-serif", color: '#ffffff', fontSize: 14,
    }}>
      Loading dashboard…
    </div>
  ),
})

const C = {
  navy: '#2a2b3c',
  orange: '#ffa500',
  blue: '#1976d2',
  bgApp: '#3a6897',
  bgSurface: '#ffffff',
  bgSubtle: '#f5f6f7',
  textPrimary: '#333333',
  textSecondary: '#55595c',
  textMuted: '#78828c',
  border: '#e0e0e0',
  error: '#ff5252',
  success: '#4caf50',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: '0 12px',
  fontSize: 14,
  fontFamily: "'Roboto', sans-serif",
  color: C.textPrimary,
  background: C.bgSurface,
  outline: 'none',
  boxSizing: 'border-box',
}

export default function AdminShell({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setAuthed(true)
      } else {
        setError('Incorrect password. Please try again.')
      }
    } catch {
      setError('Network error — please try again.')
    }
    setLoading(false)
  }

  if (authed) {
    return <DashboardWrapper />
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: C.bgApp,
      fontFamily: "'Roboto', sans-serif",
    }}>
      <div style={{
        background: C.bgSurface,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: 40,
        width: 360,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <span style={{
            background: C.orange,
            color: C.navy,
            fontWeight: 700,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            letterSpacing: '0.08em',
          }}>DA</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary }}>
            Marketing OS
          </span>
        </div>

        <h1 style={{
          fontSize: 18,
          fontWeight: 600,
          color: C.textPrimary,
          margin: '0 0 6px',
        }}>
          Admin Login
        </h1>
        <p style={{
          fontSize: 13,
          color: C.textMuted,
          margin: '0 0 24px',
        }}>
          Enter your admin password to continue.
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 500,
              color: C.textSecondary,
              marginBottom: 6,
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              style={inputStyle}
              autoFocus
              required
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: C.error, margin: '0 0 12px' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              height: 36,
              background: (loading || !password) ? C.bgSubtle : C.success,
              color: (loading || !password) ? C.textMuted : '#ffffff',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              cursor: (loading || !password) ? 'not-allowed' : 'pointer',
              fontFamily: "'Roboto', sans-serif",
              opacity: (loading || !password) ? 0.6 : 1,
            }}
          >
            {loading ? 'Checking…' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}
