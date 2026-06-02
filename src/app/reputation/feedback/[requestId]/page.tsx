import FeedbackForm from '@/components/reputation/FeedbackForm'

export const dynamic = 'force-dynamic'

// PUBLIC page (no auth) — linked from the "Share private feedback" button in
// review-request emails. Lives outside the /reputation/(admin) route group so
// the admin auth gate does not apply.
export default function FeedbackPage({ params }: { params: { requestId: string } }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#3a6897', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Roboto', sans-serif",
    }}>
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, padding: 36, width: 440, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <span style={{ background: '#ffa500', color: '#2a2b3c', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.08em' }}>DA</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>DealerAddendums</span>
        </div>
        <FeedbackForm requestId={params.requestId} />
      </div>
    </div>
  )
}
