-- 014_ads_phase2.sql — Google Ads Phase 2: proposals, write path, results.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- Migration 009 shipped proposed_changes + change_audit as empty scaffolding
-- for exactly this. Both are still empty (0 rows), so the type constraint can
-- be replaced rather than widened.

-- ── proposed_changes ────────────────────────────────────────────────────────

-- The allowed change types, rewritten.
--
-- `budget_change` and `bid_change` are REMOVED on purpose. Budget and
-- bidding-strategy changes are out of scope for automated proposals — they are
-- the two levers that can run up spend fastest, and no mutate function for
-- either exists in the code. Removing them from the constraint means the
-- database itself cannot hold such a row, so a future bug or a hand-written
-- insert cannot smuggle one into the approval queue and get it applied.
alter table proposed_changes drop constraint if exists proposed_changes_type_check;
alter table proposed_changes add constraint proposed_changes_type_check
  check (type in (
    'negative_keyword',           -- add a negative (campaign or ad group level)
    'new_keyword',                -- add a positive keyword
    'new_ad',                     -- create a new RSA
    'updated_ad',                 -- new RSA + pause the old one
    'pause_ad',
    'enable_ad',
    'google_recommendation'       -- apply one specific Google recommendation
  ));

alter table proposed_changes
  -- Exact mutate parameters, built when the proposal is created and sent to
  -- Google verbatim at apply time. Keeping them here (rather than rebuilding
  -- from before/after at apply time) means what was approved is exactly what
  -- is sent — the reviewed thing and the applied thing cannot drift.
  add column if not exists payload jsonb,
  add column if not exists evidence text,
  add column if not exists expected_impact text,
  -- Which deep-analysis run produced this.
  add column if not exists analysis_id uuid,
  -- For google_recommendation rows: the verdict and Google's own numbers.
  add column if not exists recommendation_type text,
  add column if not exists recommendation_verdict text
    check (recommendation_verdict is null
           or recommendation_verdict in ('implement', 'reject', 'defer')),
  -- What Google actually said and created, captured at apply time.
  add column if not exists google_response jsonb,
  add column if not exists applied_resource_names jsonb,
  -- True when applied while ADS_WRITES_ENABLED was false: the row records what
  -- WOULD have been sent, and nothing reached Google. Distinct from applied so
  -- a dry run can never be mistaken for a real change.
  add column if not exists dry_run boolean not null default false,

  -- ── Results tracking ──────────────────────────────────────────────────────
  -- The affected entity's 30-day metrics as of the moment of application. This
  -- is the only "before" that can ever be captured: Google will not return this
  -- window again once it moves, so it is snapshotted at apply time or lost.
  add column if not exists applied_snapshot jsonb,
  -- Post-application windows, filled in by the results cron as they mature.
  add column if not exists post_14d jsonb,
  add column if not exists post_30d jsonb,
  add column if not exists post_14d_at timestamptz,
  add column if not exists post_30d_at timestamptz;

create index if not exists proposed_changes_analysis_idx
  on proposed_changes (analysis_id, created_at desc);
-- Drives the results cron: applied rows whose windows are not yet filled.
create index if not exists proposed_changes_applied_idx
  on proposed_changes (applied_at)
  where status = 'applied';

-- ── change_audit ────────────────────────────────────────────────────────────
-- `apply_skipped_phase1` stays in the allowed set for the historical record
-- even though Phase 1 is over; `apply_dry_run` is its Phase 2 equivalent.
alter table change_audit drop constraint if exists change_audit_action_check;
alter table change_audit add constraint change_audit_action_check
  check (action in (
    'proposed', 'approved', 'rejected', 'apply_attempted',
    'applied', 'apply_failed', 'apply_skipped_phase1',
    'apply_dry_run', 'results_measured'
  ));

-- ── ads_analyses ────────────────────────────────────────────────────────────
-- One row per Deep Ads Analysis run. Deliberately NOT the `analyses` table
-- (migration 012): that one backs the cross-channel Analyst brief and is read
-- by /api/analyst/latest, which would start returning Ads runs if they shared
-- it. Different shape, different consumer, different table.
--
-- The snapshot is stored for the same reason as in 012: a proposal is only
-- auditable if you can still see the numbers it was derived from, and Google
-- will not return this window again.
create table if not exists ads_analyses (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  customer_id  text not null,
  customer_name text,
  date_range   jsonb not null default '{}'::jsonb,
  snapshot     jsonb not null,
  -- The prose half: summary, and the budget/bidding/campaign items that are
  -- deliberately NOT proposals because a human has to decide them.
  brief        jsonb,
  raw_response text,
  model        text not null,
  status       text not null default 'ok'
                 check (status in ('ok', 'parse_error', 'error')),
  error        text,
  proposal_count int not null default 0
);

create index if not exists ads_analyses_customer_idx
  on ads_analyses (customer_id, created_at desc);

-- RLS: server-side routes use the service-role key, which bypasses it.
-- Default-deny for the anon key that ships in the public site's JavaScript —
-- these rows carry full campaign spend and the exact mutate parameters for
-- an account that can spend money.
alter table ads_analyses enable row level security;
