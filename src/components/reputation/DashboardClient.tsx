'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { C, Btn } from './ui'

export function QuickActions({ gbpConnected }: { gbpConnected: boolean }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  async function syncNow() {
    setSyncing(true)
    setMsg('')
    try {
      const res = await fetch('/api/reputation/gbp/sync', { method: 'POST' })
      const data = await res.json()
      setMsg(res.ok ? `Synced ${data.count} reviews.` : (data.error || 'Sync failed.'))
      if (res.ok) router.refresh()
    } catch {
      setMsg('Sync failed.')
    }
    setSyncing(false)
  }

  async function connectGoogle() {
    const res = await fetch('/api/reputation/gbp/connect', { method: 'POST' })
    const data = await res.json()
    setMsg(data.message || 'GBP connection pending.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link href="/reputation/requests" style={{ textDecoration: 'none' }}>
        <Btn kind="primary" style={{ width: '100%' }}>Send Review Requests</Btn>
      </Link>
      <Btn kind="secondary" onClick={syncNow} disabled={syncing} style={{ width: '100%' }}>
        {syncing ? 'Syncing…' : 'Sync Reviews Now'}
      </Btn>
      {!gbpConnected && (
        <Btn kind="secondary" onClick={connectGoogle} style={{ width: '100%' }}>Connect Google</Btn>
      )}
      {msg && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{msg}</div>}
    </div>
  )
}
