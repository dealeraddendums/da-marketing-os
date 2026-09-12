import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import {
  applyMutation, adsWritesEnabled, MAX_MUTATIONS_PER_BATCH,
  resultScopeFor, type MutatePayload, type MutateKind,
} from '@/lib/google/ads-write'
import { entityMetrics } from '@/lib/google/ads'
import { auditLog } from '@/lib/ads-analyst/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * POST /api/ads/apply  { ids: string[] }
 *
 * Execute approved proposals against Google. This is the ONLY route that can
 * change an Ads account.
 *
 * Every id must already be an APPROVED row — approval happens in the Approvals
 * tab, never here, so a batch cannot approve and apply in one unreviewed step.
 * Capped at MAX_MUTATIONS_PER_BATCH.
 *
 * Ships inert: with ADS_WRITES_ENABLED unset or not exactly 'true', each row is
 * marked applied with dry_run = true and the exact request that WOULD have been
 * sent is stored, so the batch is reviewable before anything is armed.
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null
  const ids = (body?.ids ?? []).filter(x => typeof x === 'string')
  if (!ids.length) return NextResponse.json({ error: 'ids[] is required' }, { status: 400 })
  if (ids.length > MAX_MUTATIONS_PER_BATCH) {
    return NextResponse.json({
      error: `At most ${MAX_MUTATIONS_PER_BATCH} changes can be applied in one batch (got ${ids.length}).`,
    }, { status: 400 })
  }

  const { data: rows, error } = await supabase
    .from('proposed_changes').select('*').in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 502 })

  const results: {
    id: string; ok: boolean; dryRun: boolean; status: string
    summary: string; error?: string; resourceNames?: string[]
    requests?: unknown
  }[] = []

  for (const row of rows ?? []) {
    // Re-checked per row rather than trusted from the request: the only thing
    // that authorises a mutation is an approved row in the database.
    if (row.status !== 'approved') {
      results.push({
        id: row.id, ok: false, dryRun: !adsWritesEnabled, status: row.status,
        summary: row.summary ?? '',
        error: `Not approved (status is "${row.status}") — approve it in the Approvals tab first.`,
      })
      continue
    }
    const payload = row.payload as MutatePayload | null
    if (!payload?.kind) {
      results.push({
        id: row.id, ok: false, dryRun: !adsWritesEnabled, status: row.status,
        summary: row.summary ?? '', error: 'This row has no mutate payload.',
      })
      continue
    }

    await auditLog([{
      proposed_change_id: row.id, action: 'apply_attempted', actor: 'admin',
      detail: { kind: payload.kind, dryRun: !adsWritesEnabled },
    }])

    // ── Capture the "before" BEFORE mutating ────────────────────────────────
    // This is the only chance: Google will not return this window again once
    // it moves. Captured even on a dry run so a later real apply of the same
    // proposal still has a baseline, and failure to capture never blocks the
    // change — a missing baseline costs a comparison, not a change.
    let appliedSnapshot: Record<string, unknown> | null = null
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 29 * 86400000)
      const scope = resultScopeFor(payload.kind as MutateKind, {
        adGroupId: row.target_ad_group_id,
        adId: null,
        campaignId: row.target_campaign_id,
      })
      const [entity, account] = await Promise.all([
        entityMetrics(row.target_customer_id, scope, iso(start), iso(end), payload.loginCustomerId || undefined),
        entityMetrics(row.target_customer_id, { kind: 'account' }, iso(start), iso(end), payload.loginCustomerId || undefined),
      ])
      appliedSnapshot = {
        capturedAt: new Date().toISOString(),
        window: { from: iso(start), to: iso(end) },
        scope, entity, account,
      }
    } catch (err) {
      console.error('[ads-apply] snapshot capture failed:', err instanceof Error ? err.message : err)
    }

    const result = await applyMutation(payload)

    // For an ad-creating change, remember the new ad id so results tracking can
    // measure the ad itself rather than the whole ad group.
    const newAdId = result.resourceNames
      .map(rn => /\/adGroupAds\/\d+~(\d+)$/.exec(rn)?.[1])
      .filter(Boolean)[0] ?? null
    if (appliedSnapshot && newAdId) appliedSnapshot.adId = newAdId

    const now = new Date().toISOString()
    // A DRY RUN IS NOT A CHANGE, so it must not consume the row.
    //
    // Marking it 'applied' would strand it: after ADS_WRITES_ENABLED is turned
    // on, the row would sit in a terminal state having never reached Google,
    // and the operator would have to reset it by hand to actually apply what
    // they approved. Instead the row stays 'approved', records that a dry run
    // happened and exactly what it would have sent, and remains applyable.
    const patch: Record<string, unknown> = !result.ok
      ? { status: 'failed', error: result.error ?? 'Unknown error', google_response: result.responses }
      : result.dryRun
        ? {
            dry_run: true,
            google_response: { dryRun: true, at: now, requests: result.requests },
            applied_snapshot: appliedSnapshot,
          }
        : {
            status: 'applied', applied_at: now, error: null, dry_run: false,
            google_response: result.responses,
            applied_resource_names: result.resourceNames,
            applied_snapshot: appliedSnapshot,
          }

    const { error: updErr } = await supabase.from('proposed_changes').update(patch).eq('id', row.id)
    if (updErr) console.error('[ads-apply] status update failed:', updErr.message)

    await auditLog([{
      proposed_change_id: row.id,
      action: result.ok ? (result.dryRun ? 'apply_dry_run' : 'applied') : 'apply_failed',
      actor: 'admin',
      detail: {
        kind: payload.kind,
        dryRun: result.dryRun,
        requests: result.requests,
        resourceNames: result.resourceNames,
        appliedSnapshot,
        error: result.error ?? null,
      },
    }])

    results.push({
      id: row.id, ok: result.ok, dryRun: result.dryRun,
      // Still 'approved' after a dry run: nothing was applied, and the row is
      // deliberately left ready to apply for real.
      status: !result.ok ? 'failed' : result.dryRun ? 'approved (dry run recorded)' : 'applied',
      summary: row.summary ?? '',
      error: result.error,
      resourceNames: result.resourceNames,
      requests: result.dryRun ? result.requests : undefined,
    })
  }

  const applied = results.filter(r => r.ok).length
  console.log(
    `[ads-apply] batch of ${results.length}: ${applied} ok, ${results.length - applied} failed, ` +
    `dryRun=${!adsWritesEnabled}`,
  )

  return NextResponse.json({
    dryRun: !adsWritesEnabled,
    writesEnabled: adsWritesEnabled,
    applied,
    failed: results.length - applied,
    results,
    note: adsWritesEnabled
      ? undefined
      : 'ADS_WRITES_ENABLED is not "true" — nothing was sent to Google. Each row records the ' +
        'exact request that would have been sent and stays approved, so the same batch can be ' +
        'applied for real once writes are armed.',
  })
}
