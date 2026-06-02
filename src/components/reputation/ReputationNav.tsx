'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { C } from './ui'

const TABS = [
  { href: '/reputation', label: 'Dashboard' },
  { href: '/reputation/reviews', label: 'Reviews' },
  { href: '/reputation/requests', label: 'Review Requests' },
  { href: '/reputation/settings', label: 'Settings' },
]

export default function ReputationNav() {
  const pathname = usePathname()
  return (
    <div style={{ background: C.navy, borderBottom: `2px solid ${C.orange}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 4, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 24, padding: '12px 0' }}>
          <span style={{ background: C.orange, color: C.navy, fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.08em' }}>DA</span>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Reputation</span>
        </div>
        {TABS.map(t => {
          const active = pathname === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                color: active ? C.navy : '#cfd2dc',
                background: active ? C.orange : 'transparent',
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                padding: '8px 14px', borderRadius: 4, margin: '8px 0',
              }}
            >
              {t.label}
            </Link>
          )
        })}
        <div style={{ flex: 1 }} />
        <Link href="/admin" style={{ color: '#cfd2dc', fontSize: 13, textDecoration: 'none', padding: '8px 0' }}>
          ← Marketing OS
        </Link>
      </div>
    </div>
  )
}
