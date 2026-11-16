-- 029_ab_home_assigned_raw.sql — bot-proof the Home B visitor count.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- 'visitors' now means BEACON-VERIFIED visits: incremented by /api/ab/seen
-- (client-side JS, once per browser per 24h), which a no-JS crawler never
-- reaches. 'assigned_raw' is the old semantics — every middleware assignment,
-- UA-gate-passing bots included — kept as its own metric so the bot share is
-- visible (visitors ÷ assigned_raw) instead of silently polluting the test.
--
-- No new table; just widen the metric check. The increment function is
-- metric-agnostic already.

alter table ab_home_stats drop constraint if exists ab_home_stats_metric_check;
alter table ab_home_stats add constraint ab_home_stats_metric_check
  check (metric in ('visitors', 'form_start', 'assigned_raw'));
