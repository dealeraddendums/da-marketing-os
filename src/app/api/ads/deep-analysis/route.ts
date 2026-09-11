import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/reputation'
import { supabase } from '@/lib/supabase'
import { getConnectionStatus } from '@/lib/google/oauth'
import { listAdsAccounts, AdsError } from '@/lib/google/ads'
import { surfaceGranted, normalizeCustomerId } from '@/lib/google/config'
import { resolveRange } from '@/lib/google/range'
import { buildAdsSnapshot } from '@/lib/ads-analyst/snapshot'
import { analyzeAdsSnapshot } from '@/lib/ads-analyst/analyze'
import { prepareProposals, initialStatusFor } from '@/lib/ads-analyst/proposals'
import {
  tryAcquireAdsRun, releaseAdsRun, isMissingTable, MIGRATION_HINT, auditLog,
} from '@/lib/ads-analyst/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/ads/deep-analysis?customerId=…[&days=30]
 *
 * Pull the account deeply (read-only), send it to Claude, and turn the
 * proposals into rows in the existing approval queue. NOTHING is applied here:
 * this endpoint cannot mutate a Google account, and every row it writes starts
 * at 'pending' (or 'rejected', for recommendations the analyst advised against).
 */
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const customerId = normalizeCustomerId(searchParams.get('customerId') || '')
  if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })

  const { startDate, endDate, days } = resolveRange(searchParams)

  const connection = await getConnectionStatus()
  if (!connection.connected) {
    return NextResponse.json({ error: 'Google is not connected' }, { status: 503 })
  }
  if (!surfaceGranted('ads', connection.scopes ?? [])) {
    return NextResponse.json({
      error: 'This Google connection lacks the Ads (adwords) scope — reconnect to grant it.',
    }, { status: 503 })
  }

  const lock = tryAcquireAdsRun(customerId)
  if (!lock.ok) {
    return NextResponse.json({
      error: 'A deep analysis is already running for this account',
      startedAt: new Date(lock.startedAt).toISOString(),
    }, { status: 409 })
  }

  try {
    // Resolve the manager hop (if any) the same way the Ads tab does, rather
    // than trusting an env value that may name an inaccessible manager.
    let login: string | null = null
    try {
      const { accounts } = await listAdsAccounts()
      login = accounts.find(a => a.id === customerId)?.viaManager ?? null
    } catch { /* direct access is the common case; carry on without it */ }

    const snapshot = await buildAdsSnapshot(customerId, startDate, endDate, login ?? undefined, days)
    console.log(
      `[ads-analyst] snapshot ${customerId}: ~${snapshot.meta.approxTokens} tokens, ` +
      `${snapshot.campaigns.length} campaigns, ${snapshot.adGroups.length} ad groups, ` +
      `${snapshot.keywords.length} keywords, ${snapshot.searchTerms.length} search terms, ` +
      `${snapshot.ads.length} ads, ${snapshot.recommendations.length} recommendations, ` +
      `dropped=${JSON.stringify(snapshot.meta.dropped)}`,
    )

    const result = await analyzeAdsSnapshot(snapshot)

    const { data: run, error: runErr } = await supabase
      .from('ads_analyses')
      .insert({
        customer_id: customerId,
        customer_name: snapshot.meta.customerName,
        date_range: {
          ...snapshot.meta.dateRange,
          usage: result.usage, runMs: result.runMs,
          approxSnapshotTokens: snapshot.meta.approxTokens,
        },
        snapshot,
        brief: result.brief,
        raw_response: result.status === 'ok' ? null : result.rawResponse,
        model: result.model,
        status: result.status,
        error: result.status === 'parse_error'
          ? 'Model response was not valid JSON matching the brief schema' : null,
        proposal_count: 0,
      })
      .select('id')
      .single()

    if (runErr) {
      console.error('[ads-analyst] storing run failed:', runErr.message)
      return NextResponse.json({
        error: isMissingTable(runErr) ? MIGRATION_HINT : runErr.message,
        migrationPending: isMissingTable(runErr),
        brief: result.brief, status: result.status,
      }, { status: isMissingTable(runErr) ? 503 : 502 })
    }

    // ── Proposals → approval queue ──────────────────────────────────────────
    let inserted = 0
    let rejectedPrep: { summary: string; type: string; reason: string }[] = []
    if (result.brief?.proposals?.length) {
      const { prepared, rejected } = prepareProposals(snapshot, result.brief.proposals, login)
      rejectedPrep = rejected
      if (rejected.length) {
        console.warn(`[ads-analyst] ${rejected.length} proposal(s) not applyable: ${JSON.stringify(rejected)}`)
      }
      if (prepared.length) {
        const rows = prepared.map(p => ({
          type: p.type,
          target_customer_id: customerId,
          target_campaign_id: p.target_campaign_id,
          target_ad_group_id: p.target_ad_group_id,
          target_resource: p.target_resource,
          target_label: p.target_label,
          before_json: p.before_json,
          after_json: p.after_json,
          summary: p.summary,
          rationale: p.evidence,
          evidence: p.evidence,
          expected_impact: p.expected_impact,
          payload: p.payload,
          analysis_id: run.id,
          recommendation_type: p.recommendation_type,
          recommendation_verdict: p.recommendation_verdict,
          source: 'ai',
          status: initialStatusFor(p),
          ...(initialStatusFor(p) === 'rejected'
            ? { rejected_at: new Date().toISOString(), decided_by: 'analyst' }
            : {}),
        }))
        const { data: ins, error: insErr } = await supabase
          .from('proposed_changes').insert(rows as never).select('id, status, type')
        if (insErr) {
          console.error('[ads-analyst] inserting proposals failed:', insErr.message)
        } else {
          inserted = ins?.length ?? 0
          await auditLog((ins ?? []).map(r => ({
            proposed_change_id: r.id,
            action: r.status === 'rejected' ? 'rejected' : 'proposed',
            actor: 'ai',
            detail: { analysis_id: run.id, type: r.type, customer_id: customerId },
          })))
          await supabase.from('ads_analyses').update({ proposal_count: inserted }).eq('id', run.id)
        }
      }
    }

    return NextResponse.json({
      id: run.id,
      status: result.status,
      customerId,
      customerName: snapshot.meta.customerName,
      brief: result.brief,
      rawResponse: result.status === 'ok' ? null : result.rawResponse,
      model: result.model,
      usage: result.usage,
      runMs: result.runMs,
      dateRange: snapshot.meta.dateRange,
      approxSnapshotTokens: snapshot.meta.approxTokens,
      snapshotCounts: {
        campaigns: snapshot.campaigns.length, adGroups: snapshot.adGroups.length,
        keywords: snapshot.keywords.length, searchTerms: snapshot.searchTerms.length,
        ads: snapshot.ads.length, recommendations: snapshot.recommendations.length,
        dropped: snapshot.meta.dropped,
      },
      autoApply: snapshot.changeHistory.autoApply,
      proposalsQueued: inserted,
      proposalsNotApplyable: rejectedPrep,
      sourceErrors: snapshot.meta.errors,
    })
  } catch (err) {
    const message = err instanceof AdsError || err instanceof Error ? err.message : 'Deep analysis failed'
    console.error('[ads-analyst] run failed:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    releaseAdsRun(customerId)
  }
}
