-- 006_dynamic_landing.sql — Dynamic Landing Engine Phase 1
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb)
-- via the SQL editor or `supabase db push` / Management API.

-- ── Hero cache (server-rendered when warm; short TTL) ────────────────────────
create table if not exists hero_cache (
  context_key   text primary key,           -- ctx_<fnv1a> from lib/context-key.ts
  variation_id  text not null,              -- gen_<hash of output>
  hero          jsonb not null,             -- { headline, subheadline, ctaText, proofLine, featuredBenefits[] }
  signals       jsonb,                      -- the signals that produced it (keyword, cluster, dealerType, ...)
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  hits          integer not null default 0
);
create index if not exists hero_cache_expires_idx on hero_cache (expires_at);

-- ── Audit log: EVERY generation attempt, pass or fail ────────────────────────
create table if not exists generated_variations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  context_key       text not null,
  variation_id      text,                   -- null when generation/parse failed outright
  inputs            jsonb not null,         -- { keyword, keywordCluster, dealerType, utmCampaign, device, returning }
  output            jsonb,                  -- the raw hero JSON (even when it failed validation)
  model             text,
  validator_model   text,
  validation_pass   boolean not null default false,
  validation_errors jsonb,                  -- string[] of lint + secondary-check violations
  duration_ms       integer,
  published         boolean not null default false  -- true = written to hero_cache
);
create index if not exists generated_variations_ctx_idx on generated_variations (context_key, created_at desc);
create index if not exists generated_variations_day_idx on generated_variations (created_at);

-- ── Join keys for the revenue loop (visitor → lead → trial → paid) ───────────
alter table marketing_leads
  add column if not exists context_key  text,
  add column if not exists variation_id text;

alter table ab_events
  add column if not exists context_key  text,
  add column if not exists variation_id text;
