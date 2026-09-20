// Channel experiments — did money spent on a channel we cannot query produce
// real trials?
//
// Google Ads has a reporting API, so Phase 2 can measure a keyword change
// against Google's own numbers. A ChatGPT Ads pilot has none. The only record
// we control is first-party: marketing_leads rows carrying the experiment's
// utm_source, and what became of each one.
//
// The rules, all of which exist because the alternative flatters the channel:
//
//  • The success metric is a PROVISIONED trial account, not a lead and not a
//    form submit. A lead is someone who typed an email; roughly a third of the
//    confirmed ones on this account never became an account at all (held for
//    legitimacy review, or already existed).
//  • Confirmations keep arriving after the window closes, so a count taken on
//    the end date is a floor, not a final score.
//  • Attribution is first-touch and the cookie is set ONCE. A returning visitor
//    who already carries an earlier source will never be attributed here. This
//    undercounts a new channel and can never overcount it.
//  • Spend is typed in by a human. A stale spend figure makes cost-per-trial a
//    fiction, so its age is tracked and surfaced.
//  • At a threshold of 2, one signup flips the verdict. That is not a
//    measurement, and the UI must not present it as one.

import { supabase } from '@/lib/supabase'

export interface ExperimentRow {
  id: string
  created_at: string
  updated_at: string
  name: string
  channel: string
  utm_source: string
  start_date: string
  end_date: string | null
  budget_cap: number | null
  spend: number
  spend_updated_at: string | null
  threshold: number
  threshold_metric: string
  decision: 'running' | 'keep' | 'kill'
  decided_at: string | null
  notes: string | null
}

interface LeadRow {
  id: string
  email: string | null
  dealership: string | null
  created_at: string
  confirmed_at: string | null
  converted_at: string | null
  provision_status: string | null
  utm_campaign: string | null
  mrr: number | null
}

export interface LeadSummary {
  id: string
  email: string | null
  dealership: string | null
  createdAt: string
  outcome: 'trial' | 'awaiting_review' | 'awaiting_confirmation'
    | 'existing_account' | 'not_confirmed' | 'dismissed'
  converted: boolean
}

export interface ExperimentResult {
  /** Every lead that arrived in the window carrying this utm_source. */
  leads: number
  /** Clicked the emailed confirm link. NOT the same as "got a trial". */
  confirmed: number
  /** Became a real trial account. This is what the threshold judges. */
  trials: number
  /** Confirmed, then held by the signup legitimacy review — may still count. */
  awaitingReview: number
  /** Submitted, never clicked the confirm link. */
  awaitingConfirmation: number
  /** Confirmed, but the dealer already existed — not a new trial. */
  existingAccount: number
  /** Trial → paid, from DA Platform via marketing_leads.converted_at. */
  converted: number
  mrr: number

  spend: number
  costPerTrial: number | null
  costPerLead: number | null
  budgetUsedPct: number | null
  overBudget: boolean

  daysElapsed: number
  daysRemaining: number | null
  windowClosed: boolean

  thresholdMet: boolean
  stillNeeded: number
  /** Only populated when there is enough signal for a rate to mean anything. */
  projection: { atEnd: number; note: string } | null

  /** Shown verbatim in the UI. Never summarised away. */
  caveats: string[]
  recent: LeadSummary[]
  /** True when the lead fetch hit its safety cap — counts are then a floor. */
  truncated: boolean
}

export interface ExperimentWithResult extends ExperimentRow {
  result: ExperimentResult
}

const DAY = 86400000
const PAGE = 1000
const MAX_ROWS = 20000

const todayUtc = () => new Date().toISOString().slice(0, 10)
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY)

function round2(n: number): number { return Math.round(n * 100) / 100 }

/**
 * Every lead in the window carrying this source.
 *
 * Paged with .range() rather than .limit(): PostgREST silently clamps any
 * limit to 1000 rows, so a single call would under-report a busy channel and
 * look like a correct small number.
 */
async function leadsFor(
  source: string, from: string, to: string | null,
): Promise<{ rows: LeadRow[]; truncated: boolean }> {
  const out: LeadRow[] = []
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase
      .from('marketing_leads')
      .select('id, email, dealership, created_at, confirmed_at, converted_at, ' +
              'provision_status, utm_campaign, mrr')
      // ilike with no wildcards is an exact, case-insensitive match — a lead
      // tagged `ChatGPT_Ads` must not silently fall outside its own experiment.
      .ilike('utm_source', source)
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)
    // Exclusive upper bound on the day AFTER the end date, so the end date
    // itself is fully included.
    if (to) q = q.lt('created_at', to)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    const page = (data as unknown as LeadRow[]) ?? []
    for (let i = 0; i < page.length; i++) out.push(page[i])
    if (page.length < PAGE) return { rows: out, truncated: false }
  }
  return { rows: out, truncated: true }
}

/**
 * What actually happened to a lead.
 *
 * `provision_status` is the authority, not `confirmed_at`. On this account,
 * of 13 confirmed leads only 9 became trial accounts: 3 were held by the
 * signup legitimacy review and 1 belonged to a dealer that already existed.
 * Counting confirmations as trials would have overstated by a third — enough
 * to flip a two-trial threshold on its own.
 */
function outcomeOf(l: LeadRow): LeadSummary['outcome'] {
  const s = (l.provision_status || '').toLowerCase()
  if (s === 'provisioned') return 'trial'
  if (s === 'pending_review') return 'awaiting_review'
  if (s === 'existing') return 'existing_account'
  if (s === 'dismissed') return 'dismissed'
  if (s === 'awaiting_confirmation') return 'awaiting_confirmation'
  // Pre-Layer-0 rows carry a null provision_status. Fall back to the confirm
  // stamp, which is the only other evidence those rows hold.
  return l.confirmed_at ? 'trial' : 'not_confirmed'
}

function caveatsFor(e: ExperimentRow, r: {
  leads: number; trials: number; awaitingReview: number; confirmed: number
  daysElapsed: number; daysRemaining: number | null; windowClosed: boolean
  truncated: boolean
}): string[] {
  const c: string[] = []

  if (r.truncated) {
    c.push(
      `More than ${MAX_ROWS} leads matched — the counts above are a floor, not a total.`,
    )
  }

  // Spend is the one hand-entered number, and everything money-shaped depends
  // on it being current.
  if (!e.spend) {
    c.push(
      'No spend recorded yet, so cost per trial cannot be computed. ' +
      'Enter what the channel has actually cost to make this row mean anything.',
    )
  } else if (!e.spend_updated_at) {
    c.push('Spend was entered without a timestamp — treat cost figures as undated.')
  } else {
    const age = Math.floor((Date.now() - Date.parse(e.spend_updated_at)) / DAY)
    if (age >= 7) {
      c.push(
        `Spend was last updated ${age} days ago. Cost per trial is computed from ` +
        'that figure and is stale by however much has been spent since.',
      )
    }
  }

  // The threshold is small by design, but a small threshold is not a licence to
  // read a small count as a result.
  if (e.threshold <= 3) {
    c.push(
      `The keep/kill threshold is ${e.threshold} trial(s), so a single signup moves the ` +
      'verdict. Read this as a directional check on whether the channel produces ' +
      'anything at all, not as a measurement of how well it performs.',
    )
  }

  if (r.daysElapsed < 14 && r.trials === 0) {
    c.push(
      `Only ${r.daysElapsed} day(s) in with no trials yet. Paid channels rarely convert ` +
      'on day one, and nothing here is evidence of failure this early.',
    )
  }

  if (r.leads === 0 && r.daysElapsed >= 7) {
    c.push(
      'Zero leads carry this utm_source after a week. Before concluding the channel ' +
      'does not work, confirm the ads actually tag ' +
      `utm_source=${e.utm_source} — an untagged ad is invisible to this view, ` +
      'and would look identical to one nobody clicked.',
    )
  }

  if (r.awaitingReview > 0) {
    c.push(
      `${r.awaitingReview} confirmed signup(s) are held in the legitimacy review queue and ` +
      'are NOT counted as trials yet. Approving them in DA Platform would move them ' +
      'into the trial count.',
    )
  }

  // Attribution is the structural limit, and it only ever cuts one way.
  c.push(
    'Attribution is first-touch and the cookie is written once per visitor for 90 days: ' +
    'anyone who had already visited from another source keeps that source even after ' +
    'clicking this channel\'s ad. That undercounts this experiment and can never ' +
    'overcount it, so the true figure is this one or better.',
  )

  if (r.windowClosed) {
    c.push(
      'The window has closed, but leads that arrived inside it can still confirm and ' +
      'provision afterwards — this count can rise again.',
    )
  } else if (r.confirmed < r.leads) {
    c.push(
      `${r.leads - r.confirmed} lead(s) have not confirmed yet. Some still will, so the ` +
      'trial count is a floor.',
    )
  }

  return c
}

export function computeResult(e: ExperimentRow, rows: LeadRow[], truncated: boolean): ExperimentResult {
  const today = todayUtc()
  const counts = {
    trial: 0, awaiting_review: 0, awaiting_confirmation: 0,
    existing_account: 0, not_confirmed: 0, dismissed: 0,
  }
  let confirmed = 0, converted = 0, mrr = 0
  const recent: LeadSummary[] = []

  for (let i = 0; i < rows.length; i++) {
    const l = rows[i]
    const outcome = outcomeOf(l)
    counts[outcome] += 1
    if (l.confirmed_at) confirmed += 1
    if (l.converted_at) { converted += 1; mrr += Number(l.mrr || 0) }
    if (recent.length < 50) {
      recent.push({
        id: l.id,
        email: l.email,
        dealership: l.dealership,
        createdAt: l.created_at,
        outcome,
        converted: !!l.converted_at,
      })
    }
  }

  const trials = counts.trial
  const leads = rows.length

  // Elapsed days are capped at the end date — an experiment that ended a month
  // ago has not been running for a month.
  const endOrToday = e.end_date && e.end_date < today ? e.end_date : today
  const daysElapsed = Math.max(1, dayDiff(e.start_date, endOrToday) + 1)
  const daysRemaining = e.end_date ? Math.max(0, dayDiff(today, e.end_date)) : null
  const windowClosed = !!e.end_date && e.end_date < today

  const spend = Number(e.spend || 0)
  const costPerTrial = spend > 0 && trials > 0 ? round2(spend / trials) : null
  const costPerLead = spend > 0 && leads > 0 ? round2(spend / leads) : null
  const budgetUsedPct = e.budget_cap && Number(e.budget_cap) > 0
    ? Math.round((spend / Number(e.budget_cap)) * 100)
    : null
  const overBudget = !!e.budget_cap && spend > Number(e.budget_cap)

  const thresholdMet = trials >= e.threshold
  const stillNeeded = Math.max(0, e.threshold - trials)

  // A run rate off fewer than 3 trials is arithmetic, not a forecast. Below
  // that we say so instead of drawing a line through two points.
  let projection: ExperimentResult['projection'] = null
  if (daysRemaining !== null && daysRemaining > 0) {
    if (trials >= 3) {
      const atEnd = Math.round(trials + (trials / daysElapsed) * daysRemaining)
      projection = {
        atEnd,
        note: `At the observed rate (${round2(trials / daysElapsed)}/day) this reaches about ` +
              `${atEnd} trial(s) by ${e.end_date}.`,
      }
    } else {
      projection = {
        atEnd: trials,
        note: `Too few trials (${trials}) to project a rate. ` +
              `${stillNeeded} more needed in the remaining ${daysRemaining} day(s).`,
      }
    }
  }

  return {
    leads, confirmed, trials,
    awaitingReview: counts.awaiting_review,
    awaitingConfirmation: counts.awaiting_confirmation,
    existingAccount: counts.existing_account,
    converted, mrr: round2(mrr),
    spend, costPerTrial, costPerLead, budgetUsedPct, overBudget,
    daysElapsed, daysRemaining, windowClosed,
    thresholdMet, stillNeeded, projection,
    caveats: caveatsFor(e, {
      leads, trials, awaitingReview: counts.awaiting_review, confirmed,
      daysElapsed, daysRemaining, windowClosed, truncated,
    }),
    recent, truncated,
  }
}

/** One experiment, with its results computed from first-party data. */
export async function withResult(e: ExperimentRow): Promise<ExperimentWithResult> {
  const to = e.end_date
    ? new Date(Date.parse(e.end_date + 'T00:00:00Z') + DAY).toISOString().slice(0, 10)
    : null
  const { rows, truncated } = await leadsFor(e.utm_source, e.start_date, to)
  return { ...e, result: computeResult(e, rows, truncated) }
}

export function isMissingExperimentsTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205' || err.code === '42P01') return true
  const m = err.message || ''
  return /relation .* does not exist/i.test(m) || /could not find the table/i.test(m)
}

export const EXPERIMENTS_MIGRATION_HINT =
  'Apply supabase/migrations/015_channel_experiments.sql in the Supabase SQL editor ' +
  '(project huqohncglbshwuzeguvb) — the channel_experiments table does not exist yet.'
