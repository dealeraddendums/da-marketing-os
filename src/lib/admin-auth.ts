import type { NextRequest } from 'next/server'

// Same gate the /admin page uses: the da_admin_auth cookie set by
// /api/admin-auth must equal ADMIN_PASSWORD. Unset password ⇒ always denied.
export function isAdminRequest(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD
  return !!pw && req.cookies.get('da_admin_auth')?.value === pw
}
