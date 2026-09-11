import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isAdminAuthed } from '@/lib/reputation'
import { measureWindow } from '@/lib/ads-results'
import { auditLog } from '@/lib/ads-analyst/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface AppliedRow {
  id: string
  type: string
  target_customer_id: string
  target_ad_group_id: string | null
  target_campaign_id: string | null
  applied_at: string
  applied_snapshot: { entity?: never; account?: never; adId?: string | null } | null
  payload: { loginCustomerId?: string | null } | null
  post_14d: unknown
  post_30d: unknown
  dry_run: boolean
}

/**
 * POST /api/cron/ads-results — fill in post-application windows as they mature.
 *
 * Auth: the shared cron key, or an admin session so the page can trigger a
 * refresh on load without a second credential.
 *
 * Idempotent by construction: a window is only measured when it has fully
 * elapsed and has not already been stored, so running this hourly, nightly, or
 * twice by accident all produce the same result.
 *
 * Dry-run rows are skipped — nothing was actually changed in the account, so
 * measuring "after" would attribute ordinary drift to a change that never
 * happened.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  const authed = (process.env.DA_CRON_KEY && key === process.env.DA_CRON_KEY) || isAdminAuthed()
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: raw, error } = await supabase
    .from('proposed_changes')
    .select('id, type, target_customer_id, target_ad_group_id, target_campaign_id, ' +
            'applied_at, applied_snapshot, payload, post_14d, post_30d, dry_run')
    .eq('status', 'applied')
    .eq('dry_run', false)
    .not('applied_at', 'is', null)
    .order('applied_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 502 })
  // See the note in /api/ads/changes: a concatenated select defeats inference.
  const data = raw as unknown as AppliedRow[] | null

  let measured = 0, skipped = 0
  const details: { id: string; window: string }[] = []

  for (const row of data ?? []) {
    for (const w of ['14d', '30d'] as const) {
      const already = w === '14d' ? row.post_14d : row.post_30d
      if (already) { skipped++; continue }
      try {
        const result = await measureWindow(row as never, w)
        if (!result) { skipped++; continue } // window not matured
        const patch = w === '14d'
          ? { post_14d: result, post_14d_at: new Date().toISOString() }
          : { post_30d: result, post_30d_at: new Date().toISOString() }
        const { error: updErr } = await supabase
          .from('proposed_changes').update(patch).eq('id', row.id)
        if (updErr) { console.error('[ads-results] update failed:', updErr.message); continue }
        await auditLog([{
          proposed_change_id: row.id, action: 'results_measured', actor: 'system',
          detail: { window: w, entity: result.entity, delta: result.delta, caveats: result.caveats },
        }])
        measured++
        details.push({ id: row.id, window: w })
      } catch (err) {
        console.error(`[ads-results] ${row.id} ${w} failed:`, err instanceof Error ? err.message : err)
      }
    }
  }

  console.log(`[ads-results] measured ${measured} window(s), skipped ${skipped}`)
  return NextResponse.json({ measured, skipped, details })
}
