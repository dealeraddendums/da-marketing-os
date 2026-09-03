// Email-confirmation landing page (Layer 0).
//
// This page only READS. The button posts to /api/leads/confirm, so an email
// link scanner prefetching this URL cannot provision an account — the same
// reasoning behind DA Platform's code-based migration invites.

import ConfirmButton from './ConfirmButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Confirm your email — DealerAddendums' }

export default function ConfirmPage({ params }: { params: { token: string } }) {
  return (
    <main style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, padding: 32, fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Confirm your email</h1>
        <p style={{ fontSize: 14, color: '#55595c', marginTop: 0 }}>
          One click and we&apos;ll set up your DealerAddendums trial.
        </p>
        <ConfirmButton token={params.token} />
      </div>
    </main>
  )
}
