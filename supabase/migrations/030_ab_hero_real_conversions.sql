-- 030_ab_hero_real_conversions.sql — make the hero A/B results view count real signups.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- The old ab_conversion_rates (001) counted ab_events rows with
-- event_type = 'trial_start' — an event NO code path has ever emitted (0 rows
-- since the table was created), so the admin A/B card showed 0% on every arm
-- forever. The truth has been in marketing_leads all along: /api/leads stamps
-- each lead with the hero arm the converting pageview rendered
-- (marketing_leads.ab_variant), and confirmed_at marks the emailed-link
-- confirmation that actually provisions a dealer. This view counts those,
-- retroactively — no event backfill needed.
--
-- Two windows per arm, because the Home B layout test (channel_experiments
-- row name='home_b_layout') overlapped this test 2026-11-16 → 2026-11-25 and
-- halved the traffic reaching the hero test while it ran:
--   * plain columns          — all time
--   * *_since columns        — after Home B ended. The boundary is the
--     registry's own decided_at (exact end moment), falling back to
--     2026-11-25 00:00 UTC if that row is ever deleted.
--
-- Column compatibility: ab_variant / impressions / conversions /
-- conversion_rate / first_seen / last_seen keep their names, so
-- /api/insights keeps working unchanged (its numbers become truthful instead
-- of zero). The old 30-day rolling filter is gone: this is a results view for
-- a finite test, so it reports the whole test.
--
-- drop+create (not create or replace) because the column list changes.

drop view if exists ab_conversion_rates;

create view ab_conversion_rates as
with home_b_end as (
  select coalesce(
    (select ce.decided_at
       from channel_experiments ce
      where ce.name = 'home_b_layout' and ce.decided_at is not null
      order by ce.decided_at desc
      limit 1),
    timestamptz '2026-11-25 00:00:00+00'
  ) as since
),
imp as (
  select
    e.ab_variant,
    count(*) as impressions,
    count(*) filter (where e.created_at >= (select since from home_b_end)) as impressions_since,
    min(e.created_at) as first_seen,
    max(e.created_at) as last_seen
  from ab_events e
  where e.event_type = 'hero_impression' and e.ab_variant is not null
  group by e.ab_variant
),
leads as (
  select
    l.ab_variant,
    count(*) as submits,
    count(*) filter (where l.confirmed_at is not null) as conversions,
    count(*) filter (where l.created_at >= (select since from home_b_end)) as submits_since,
    count(*) filter (where l.confirmed_at is not null
                       and l.created_at >= (select since from home_b_end)) as conversions_since
  from marketing_leads l
  where l.ab_variant is not null
  group by l.ab_variant
)
select
  ab_variant,
  coalesce(i.impressions, 0)  as impressions,
  coalesce(l.conversions, 0)  as conversions,
  round(100.0 * coalesce(l.conversions, 0)
        / nullif(coalesce(i.impressions, 0), 0), 2) as conversion_rate,
  i.first_seen,
  i.last_seen,
  coalesce(l.submits, 0)            as submits,
  coalesce(i.impressions_since, 0)  as impressions_since,
  coalesce(l.submits_since, 0)      as submits_since,
  coalesce(l.conversions_since, 0)  as conversions_since,
  round(100.0 * coalesce(l.conversions_since, 0)
        / nullif(coalesce(i.impressions_since, 0), 0), 2) as conversion_rate_since,
  (select since from home_b_end) as since_boundary
from imp i
full outer join leads l using (ab_variant);

-- The view runs with owner privileges, so it would let the anon key read
-- aggregates derived from the RLS-locked marketing_leads table. Only
-- server-side service-role routes consume it — close the anon path.
revoke select on ab_conversion_rates from anon;
revoke select on ab_conversion_rates from authenticated;
