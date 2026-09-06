import { NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { disconnect } from '@/lib/google/oauth'
import { invalidatePrefix } from '@/lib/google/cache'

export const dynamic = 'force-dynamic'

/** POST /api/google/disconnect — revoke at Google and drop the stored token. */
export async function POST() {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await disconnect()
    invalidatePrefix('google:')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'disconnect failed' }, { status: 500 },
    )
  }
}
