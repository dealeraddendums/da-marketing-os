import { redirect } from 'next/navigation'
import { isAdminAuthed, DA } from '@/lib/reputation'
import ReputationNav from '@/components/reputation/ReputationNav'

export const dynamic = 'force-dynamic'

// Auth gate for all /reputation admin pages. The public feedback page lives at
// /reputation/feedback/[requestId] (outside this route group) and is NOT gated.
export default function ReputationLayout({ children }: { children: React.ReactNode }) {
  if (!isAdminAuthed()) {
    redirect('/admin')
  }
  return (
    <div style={{ minHeight: '100vh', background: DA.bgApp, fontFamily: "'Roboto', sans-serif" }}>
      <ReputationNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>{children}</main>
    </div>
  )
}
