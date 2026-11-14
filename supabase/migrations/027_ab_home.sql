-- 027_ab_home.sql — Home B homepage layout A/B test.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- The test: variant A = the current homepage (default, control), variant B =
-- src/components/home-b (ChatGPT redesign). Bucketing is server-side in
-- middleware.ts (cookie da_ab_home, env AB_HOME_B_PCT, default 0 = all-A).
--
-- Three pieces:
--   1. marketing_leads.ab_home — the bucket, stamped at form submission so the
--      trial_signup conversion (fired later, at setup-code verification, in a
--      session where the cookie may be gone) can still carry it, and so the
--      admin card can count signups per bucket from first-party data.
--   2. ab_home_stats — tiny first-party counters (assigned visitors and trial
--      form starts per bucket); GA4 gets the same events but the admin card
--      deliberately reads OUR data, not GA4.
--   3. A channel_experiments row so the experiment registry knows this test
--      exists. Its utm_source is a sentinel that matches no leads — this is a
--      LAYOUT test measured via marketing_leads.ab_home, not a channel test.

-- 1 ── the bucket on the lead ------------------------------------------------
alter table marketing_leads
  add column if not exists ab_home text
  check (ab_home is null or ab_home in ('A', 'B'));

-- 2 ── first-party counters ---------------------------------------------------
create table if not exists ab_home_stats (
  bucket     text not null check (bucket in ('A', 'B')),
  metric     text not null check (metric in ('visitors', 'form_start')),
  count      bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, metric)
);

-- House style: RLS on, zero policies — only server-side service-role readers.
alter table ab_home_stats enable row level security;

-- Atomic increment, called fire-and-forget from the app (service role).
create or replace function increment_ab_home_stat(p_bucket text, p_metric text)
returns void
language sql
as $$
  insert into ab_home_stats (bucket, metric, count)
  values (p_bucket, p_metric, 1)
  on conflict (bucket, metric) do update
    set count = ab_home_stats.count + 1, updated_at = now();
$$;

-- The anon key ships in the public site's JS; an open RPC would let anyone
-- inflate the counters. Service role keeps execute.
revoke all on function increment_ab_home_stat(text, text) from public;
revoke all on function increment_ab_home_stat(text, text) from anon;
revoke all on function increment_ab_home_stat(text, text) from authenticated;
grant execute on function increment_ab_home_stat(text, text) to service_role;

-- 3 ── experiment registry row ------------------------------------------------
-- channel_experiments has no draft status (decision ∈ running/keep/kill) and
-- its threshold_metric check allows only 'confirmed_trials' — which IS the
-- requested success metric (provisioned trials). "Draft" is expressed in notes
-- and by AB_HOME_B_PCT=0; decision stays 'running'. Idempotent.
insert into channel_experiments
  (name, channel, utm_source, start_date, threshold, notes)
select
  'home_b_layout', 'Homepage layout test', 'home_b_layout',
  current_date, 1,
  'DRAFT until AB_HOME_B_PCT > 0 (set in .env.production on the marketing box; 0 = all traffic sees A). '
  || 'Variants: A = current homepage (control), B = Home B redesign (src/components/home-b). '
  || 'Success metric: provisioned (confirmed) trials. '
  || 'NOT a channel test — utm_source here is a sentinel that matches no leads; measurement runs on '
  || 'marketing_leads.ab_home + ab_home_stats (see the Home B card on the admin A/B tab).'
where not exists (
  select 1 from channel_experiments where lower(name) = 'home_b_layout'
);
