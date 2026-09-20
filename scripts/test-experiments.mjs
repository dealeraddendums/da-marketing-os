// Unit tests for computeResult — run with: npm run test:experiments
//
// The thing under test is the arithmetic that decides whether $500 of ad spend
// gets renewed. The failure mode that matters is OVERSTATEMENT: counting a
// confirmed email, or a signup stuck in the review queue, as a trial. On the
// live account that mistake would have turned 9 real trials into 13.
//
// Same harness as test-rsa-validation.mjs: the REAL exported function is
// transpiled and loaded, never re-implemented here, so the rules cannot drift
// away from the test that is supposed to guard them.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Module from 'node:module'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '..', 'src', 'lib', 'experiments.ts')
const source = readFileSync(file, 'utf8')

const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: 'experiments.ts',
})

const sandbox = new Module('experiments-under-test')
sandbox.require = (id) => {
  // computeResult is pure, but the module body imports the Supabase client.
  if (id === '@/lib/supabase') return { supabase: {} }
  return Module.createRequire(file)(id)
}
sandbox._compile(outputText, file)
const { computeResult } = sandbox.exports

if (typeof computeResult !== 'function') {
  console.error('computeResult was not exported — the test could not load the real function')
  process.exit(1)
}

let pass = 0, fail = 0
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString()
const day = (daysAgo) => iso(daysAgo).slice(0, 10)

const exp = (over = {}) => ({
  id: 'x', created_at: iso(30), updated_at: iso(0),
  name: 'ChatGPT Ads pilot', channel: 'ChatGPT Ads', utm_source: 'chatgpt_ads',
  start_date: day(30), end_date: day(-30), budget_cap: 500,
  spend: 200, spend_updated_at: iso(0),
  threshold: 2, threshold_metric: 'confirmed_trials',
  decision: 'running', decided_at: null, notes: null, ...over,
})

const lead = (over = {}) => ({
  id: Math.random().toString(36).slice(2), email: 'a@b.com', dealership: 'Test Motors',
  created_at: iso(5), confirmed_at: null, converted_at: null,
  provision_status: null, utm_campaign: null, mrr: null, ...over,
})

const provisioned = (o) => lead({ confirmed_at: iso(4), provision_status: 'provisioned', ...o })
const held        = (o) => lead({ confirmed_at: iso(4), provision_status: 'pending_review', ...o })
const existing    = (o) => lead({ confirmed_at: iso(4), provision_status: 'existing', ...o })
const unconfirmed = (o) => lead({ provision_status: 'awaiting_confirmation', ...o })

console.log('computeResult — channel experiment results\n')

// ── The core distinction: confirmed ≠ trial ─────────────────────────────────
{
  const r = computeResult(exp(), [provisioned(), held(), held(), existing(), unconfirmed()], false)
  check('counts every matching lead', r.leads === 5, `got ${r.leads}`)
  check('counts confirmations separately from trials', r.confirmed === 4, `got ${r.confirmed}`)
  check('ONLY a provisioned account counts as a trial', r.trials === 1, `got ${r.trials}`)
  check('a review-queue signup is not a trial', r.awaitingReview === 2, `got ${r.awaitingReview}`)
  check('an existing account is not a new trial', r.existingAccount === 1, `got ${r.existingAccount}`)
  check('an unconfirmed lead is not a trial', r.awaitingConfirmation === 1, `got ${r.awaitingConfirmation}`)
  check('the held signups are called out in the caveats',
    r.caveats.some(c => /review queue/i.test(c)))
}

// ── The threshold, which is what spends or saves the money ──────────────────
{
  const r = computeResult(exp({ threshold: 2 }), [provisioned(), provisioned()], false)
  check('threshold met on two real trials', r.thresholdMet === true)
  check('nothing further needed', r.stillNeeded === 0)
}
{
  const r = computeResult(exp({ threshold: 2 }), [provisioned(), held(), held()], false)
  check('two held signups do NOT meet a threshold of two', r.thresholdMet === false)
  check('reports exactly how many more are needed', r.stillNeeded === 1, `got ${r.stillNeeded}`)
}

// ── Cost ────────────────────────────────────────────────────────────────────
{
  const r = computeResult(exp({ spend: 500 }), [provisioned(), provisioned()], false)
  check('cost per trial divides spend by TRIALS', r.costPerTrial === 250, `got ${r.costPerTrial}`)
  check('cost per lead divides spend by leads', r.costPerLead === 250, `got ${r.costPerLead}`)
}
{
  const r = computeResult(exp({ spend: 500 }), [held(), held()], false)
  check('no trials means no cost per trial, not a divide-by-zero',
    r.costPerTrial === null, `got ${r.costPerTrial}`)
}
{
  const r = computeResult(exp({ spend: 0, spend_updated_at: null }), [provisioned()], false)
  check('zero spend yields no cost figure', r.costPerTrial === null)
  check('zero spend is called out', r.caveats.some(c => /No spend recorded/i.test(c)))
}
{
  const r = computeResult(exp({ spend: 300, spend_updated_at: iso(20) }), [provisioned()], false)
  check('a 20-day-old spend figure is flagged as stale',
    r.caveats.some(c => /last updated 20 days ago/i.test(c)))
}
{
  const r = computeResult(exp({ spend: 600, budget_cap: 500 }), [provisioned()], false)
  check('spending past the cap is flagged', r.overBudget === true)
  check('budget use is a percentage of the cap', r.budgetUsedPct === 120, `got ${r.budgetUsedPct}`)
}

// ── Pace: no forecasts off one data point ───────────────────────────────────
{
  const r = computeResult(exp({ start_date: day(10), end_date: day(-50) }), [provisioned()], false)
  check('days elapsed counts from the start date', r.daysElapsed === 11, `got ${r.daysElapsed}`)
  check('days remaining counts to the end date', r.daysRemaining === 50, `got ${r.daysRemaining}`)
  check('one trial is too few to project a rate',
    r.projection && /Too few trials/.test(r.projection.note), JSON.stringify(r.projection))
}
{
  const many = [provisioned(), provisioned(), provisioned(), provisioned()]
  const r = computeResult(exp({ start_date: day(10), end_date: day(-10) }), many, false)
  check('four trials over ten days does project forward',
    r.projection && r.projection.atEnd > 4, JSON.stringify(r.projection))
}
{
  // An experiment that ended a month ago has not been running for a month.
  const r = computeResult(exp({ start_date: day(60), end_date: day(30) }), [provisioned()], false)
  check('elapsed days stop at the end date', r.daysElapsed === 31, `got ${r.daysElapsed}`)
  check('a closed window is reported closed', r.windowClosed === true)
  check('days remaining is zero once closed', r.daysRemaining === 0, `got ${r.daysRemaining}`)
  check('a closed window still warns that late confirmations can raise the count',
    r.caveats.some(c => /can still confirm/i.test(c)))
}

// ── Honesty guards that must always fire ────────────────────────────────────
{
  const r = computeResult(exp(), [provisioned()], false)
  check('the first-touch attribution limit is always stated',
    r.caveats.some(c => /first-touch/i.test(c) && /undercounts/i.test(c)))
  check('a small threshold is always flagged as directional',
    r.caveats.some(c => /single signup moves the verdict/i.test(c)))
}
{
  const r = computeResult(exp({ start_date: day(3) }), [], false)
  check('three days with no trials is called early, not failure',
    r.caveats.some(c => /nothing here is evidence of failure this early/i.test(c)))
}
{
  const r = computeResult(exp({ start_date: day(14) }), [], false)
  check('zero leads after a week questions the TAGGING, not the channel',
    r.caveats.some(c => /confirm the ads actually tag/i.test(c)))
}
{
  const r = computeResult(exp(), [provisioned()], true)
  check('a truncated fetch reports the counts as a floor',
    r.caveats.some(c => /floor, not a total/i.test(c)))
}

// ── Paid conversion ─────────────────────────────────────────────────────────
{
  const r = computeResult(exp(), [
    provisioned({ converted_at: iso(1), mrr: 199 }),
    provisioned(),
  ], false)
  check('trial → paid is counted separately', r.converted === 1, `got ${r.converted}`)
  check('MRR sums only converted leads', r.mrr === 199, `got ${r.mrr}`)
}

// ── Legacy rows ─────────────────────────────────────────────────────────────
{
  // Pre-Layer-0 leads carry a null provision_status; the confirm stamp is the
  // only evidence they hold.
  const r = computeResult(exp(), [
    lead({ confirmed_at: iso(3), provision_status: null }),
    lead({ confirmed_at: null, provision_status: null }),
  ], false)
  check('a legacy confirmed row falls back to the confirm stamp', r.trials === 1, `got ${r.trials}`)
  check('a legacy unconfirmed row is not a trial', r.trials === 1)
}

// ── Defensive ───────────────────────────────────────────────────────────────
{
  let threw = false
  let r = null
  try { r = computeResult(exp(), [], false) } catch { threw = true }
  check('no leads at all is an empty result, not a crash', !threw && r && r.leads === 0)
  check('an empty experiment has no cost per trial', r && r.costPerTrial === null)
}
{
  const r = computeResult(exp({ end_date: null }), [provisioned()], false)
  check('an open-ended experiment has no days remaining and no projection',
    r.daysRemaining === null && r.projection === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
