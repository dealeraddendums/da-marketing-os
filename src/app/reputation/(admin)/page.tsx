import Link from 'next/link'
import { getReviews, getStats, syncReviewsToSupabase, ReviewRow } from '@/lib/reputation'
import { GBP_CONNECTED } from '@/lib/gbp'
import { Stars, StatusBadge, StatCard, Card, C, timeAgo } from '@/components/reputation/ui'
import { QuickActions } from '@/components/reputation/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function ReputationDashboard() {
  let reviews = await getReviews()
  let schemaError = ''

  // Auto-sync on first load so the inbox is pre-populated with (mock) reviews.
  if (reviews.length === 0) {
    const sync = await syncReviewsToSupabase()
    if (sync.error) schemaError = sync.error
    else reviews = await getReviews()
  }

  const stats = await getStats()
  const recent = reviews.slice(0, 5)

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>Reputation Dashboard</h1>
      <p style={{ fontSize: 14, color: '#dbe3ec', margin: '0 0 20px' }}>
        DealerAddendums Google Business Profile · {GBP_CONNECTED ? 'Live' : 'Mock data (GBP access pending)'}
      </p>

      {schemaError && <SchemaBanner detail={schemaError} />}

      {/* Stats row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <StatCard label="Google Rating" value={<span><span style={{ color: C.orange }}>★</span> {stats.averageRating || '—'}</span>} />
        <StatCard label="Total Reviews" value={stats.totalReviews} />
        <StatCard label="This Month" value={stats.reviewsThisMonth} />
        <StatCard label="Response Rate" value={`${stats.responseRate}%`} />
        <StatCard label="Unanswered" value={stats.unanswered} accent={stats.unanswered > 0} />
        <StatCard label="Requests Sent (mo)" value={stats.requestsThisMonth} />
      </div>

      {/* Two columns */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 520px', minWidth: 320 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: 0 }}>Recent Reviews</h2>
              <Link href="/reputation/reviews" style={{ fontSize: 13, color: C.blue, textDecoration: 'none' }}>View all →</Link>
            </div>
            {recent.length === 0 && (
              <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>No reviews yet.</p>
            )}
            {recent.map((r: ReviewRow) => (
              <div key={r.id} style={{ padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Stars rating={r.star_rating} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>{r.reviewer_name}</span>
                    <span style={{ fontSize: 12, color: C.textMuted }}>· {timeAgo(r.create_time)}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p style={{ fontSize: 13, color: C.textSecondary, margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {r.comment}
                </p>
                <Link href="/reputation/reviews" style={{ fontSize: 13, color: C.blue, textDecoration: 'none' }}>View &amp; Reply</Link>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ flex: '1 1 260px', minWidth: 240 }}>
          <Card>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.textPrimary, margin: '0 0 12px' }}>Quick Actions</h2>
            <QuickActions gbpConnected={GBP_CONNECTED} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function SchemaBanner({ detail }: { detail: string }) {
  return (
    <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '14px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e65100' }}>Database migration not yet applied</div>
      <p style={{ fontSize: 13, color: '#8d6e00', margin: '6px 0 0' }}>
        Run <code style={{ background: '#fff3cd', padding: '1px 5px', borderRadius: 3 }}>supabase/migrations/003_reputation.sql</code> against the
        DA Marketing OS Supabase project, then reload. (<span style={{ color: '#a1887f' }}>{detail}</span>)
      </p>
    </div>
  )
}
