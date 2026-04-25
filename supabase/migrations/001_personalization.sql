-- DealerAddendums Marketing OS — Supabase Schema
-- Run in Supabase SQL editor

-- ── A/B event tracking ──────────────────────────────────────────────────────
create table if not exists ab_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  event_type    text not null,     -- impression | cta_click | form_submit | trial_start
  ab_variant    text,              -- generic | personalized | dealertype
  utm_term      text,
  utm_campaign  text,
  utm_source    text,
  headline      text,
  ai_generated  boolean default false,
  session_id    text,
  ip_hash       text
);
create index if not exists ab_events_variant_type_idx on ab_events (ab_variant, event_type, created_at);
create index if not exists ab_events_term_idx          on ab_events (utm_term, created_at);

-- ── Personalization cache log ────────────────────────────────────────────────
create table if not exists personalization_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  utm_term      text not null,
  ab_variant    text,
  dealer_type   text,
  headline      text,
  subheadline   text,
  cached        boolean default false,
  impressions   integer default 1
);
create unique index if not exists personalization_log_unique
  on personalization_log (utm_term, ab_variant, dealer_type);

-- ── Marketing leads ──────────────────────────────────────────────────────────
create table if not exists marketing_leads (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz default now(),
  name                text,
  email               text,
  dealership          text,
  phone               text,
  source              text,              -- utm_source
  campaign            text,              -- utm_campaign
  utm_term            text,
  ab_variant          text,
  headline_seen       text,              -- which headline they saw
  landing_page        text,
  ai_enrichment       jsonb,             -- Claude analysis: dealer size, use case, etc.
  hubspot_contact_id  text,
  status              text default 'new' -- new | contacted | demo | converted | lost
);
create index if not exists marketing_leads_status_idx on marketing_leads (status, created_at);

-- ── Conversion rate view ─────────────────────────────────────────────────────
create or replace view ab_conversion_rates as
select
  ab_variant,
  count(*) filter (where event_type = 'hero_impression') as impressions,
  count(*) filter (where event_type = 'trial_start')     as conversions,
  round(
    100.0 * count(*) filter (where event_type = 'trial_start')
    / nullif(count(*) filter (where event_type = 'hero_impression'), 0),
    2
  ) as conversion_rate,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from ab_events
where created_at > now() - interval '30 days'
group by ab_variant;

-- ── Top search terms view ────────────────────────────────────────────────────
create or replace view top_utm_terms as
select
  utm_term,
  count(*) as impressions,
  count(*) filter (where event_type = 'trial_start') as conversions,
  round(
    100.0 * count(*) filter (where event_type = 'trial_start')
    / nullif(count(*), 0), 2
  ) as conversion_rate,
  bool_or(ai_generated) as ever_ai_generated
from ab_events
where utm_term is not null and utm_term != ''
  and created_at > now() - interval '30 days'
group by utm_term
order by impressions desc;
