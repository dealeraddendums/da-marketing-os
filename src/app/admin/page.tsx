import { cookies } from 'next/headers'
import AdminShell from './AdminShell'

export const dynamic = 'force-dynamic'

export default function AdminPage() {
  const cookieStore = cookies()
  const authCookie = cookieStore.get('da_admin_auth')
  const isAuthenticated = !!(
    process.env.ADMIN_PASSWORD &&
    authCookie?.value === process.env.ADMIN_PASSWORD
  )

  return <AdminShell isAuthenticated={isAuthenticated} />
}
