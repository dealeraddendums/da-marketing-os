import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { isMissingTable, MIGRATION_HINT } from '@/lib/ads-analyst/store'
import { changeEventReport, autoApplyEvidence } from '@/lib/google/ads'
import { normalizeCustomerId } from '@/lib/google/config'
import { adsWritesEnabled } from '@/lib/google/ads-write'

export const dynamic = 'force-dynamic'

interface ChangeRow {
  id: string
  applied_resource_names: string[] | null
  [key: string]: unknown
}

/**
 * GET /api/ads/changes?customerId=…[&external=1]
 *
 * Every change this app applied, with its at-apply snapshot and whatever
 * post-windows have matured.
 *
 * `external=1` additionally pulls Google's own change history for the account,
 * which is the only way to see changes this app did NOT make — a human in the
 * Ads UI, or Google auto-applying its own recommendations. An approval queue
 * that only shows its own writes gives a false sense of control.
 */
export async function GET(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const customerId = normalizeCustomerId(searchParams.get('customerId') || '')
  const wantExternal = searchParams.get('external') === '1'

  let q = supabase
    .from('proposed_changes')
    .select('id, created_at, type, status, summary, target_label, target_customer_id, ' +
            'target_ad_group_id, target_campaign_id, evidence, expected_impact, ' +
            'before_json, after_json, applied_at, dry_run, applied_resource_names, ' +
            'applied_snapshot, post_14d, post_30d, post_14d_at, post_30d_at, error')
    .in('status', ['applied', 'failed'])
    .order('applied_at', { ascending: false, nullsFirst: false })
    .limit(100)
  if (customerId) q = q.eq('target_customer_id', customerId)

  const { data: raw, error } = await q
  // supabase-js cannot infer a row type from a concatenated select string, so
  // it widens to GenericStringError. The shape is known here; assert it.
  const data = raw as unknown as ChangeRow[] | null
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ changes: [], migrationPending: true, detail: MIGRATION_HINT })
    }
    return NextResponse.json({ error: error.message }, { status: 502 })
  }

  const payload: Record<string, unknown> = {
    changes: data ?? [],
    writesEnabled: adsWritesEnabled,
  }

  if (wantExternal && customerId) {
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 29 * 86400000)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      const events = await changeEventReport(customerId, iso(start), iso(end))
      const ours = new Set(
        (data ?? []).flatMap(r => (r.applied_resource_names as string[] | null) ?? []),
      )
      payload.external = {
        total: events.length,
        autoApply: autoApplyEvidence(events),
        // Anything whose resource we did not create is, by definition, someone
        // else's change. Shown so the operator can see the whole account, not
        // just the part this app touched.
        events: events.slice(0, 60).map(e => ({
          ...e, ours: ours.has(e.resourceName),
        })),
      }
    } catch (err) {
      payload.externalError = err instanceof Error ? err.message : 'change history unavailable'
    }
  }

  return NextResponse.json(payload)
}
