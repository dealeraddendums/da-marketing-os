-- 015_channel_experiments.sql — channel experiments measured from first-party data.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- Why this table exists: we buy traffic on channels that have no API we can
-- query (the first is a $500 ChatGPT Ads pilot). There is no equivalent of the
-- Google Ads reporting surface for them, so the only trustworthy record of
-- whether the money worked is OUR OWN data — marketing_leads rows carrying the
-- experiment's utm_source, and what became of them. Spend is the single field a
-- human types in; everything else is computed.
--
-- Deliberately NOT part of proposed_changes / change_audit: nothing here can
-- change anything in an ad account. An experiment is a measurement, not a
-- mutation, and mixing it into the approval queue would blur that line.

create table if not exists channel_experiments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  name        text not null,
  -- Human label for the channel ("ChatGPT Ads"). Display only.
  channel     text not null,
  -- The matcher. Leads are attributed to an experiment by
  -- marketing_leads.utm_source, compared case-insensitively. This is the whole
  -- attribution model, and its limits are surfaced in the UI rather than hidden.
  utm_source  text not null,

  start_date  date not null,
  -- Planned end. NULL = open-ended. Leads are counted by arrival date within
  -- the window; their confirmations keep arriving after it closes.
  end_date    date,

  budget_cap  numeric,
  -- Entered by hand. There is no ChatGPT Ads API integration and this migration
  -- does not pretend there is one.
  spend            numeric not null default 0,
  spend_updated_at timestamptz,

  -- How many of the success metric are needed to keep the channel.
  threshold        int not null default 1,
  -- One allowed value on purpose. The success metric for a paid-channel test is
  -- a real trial account, never a lead or a form submit; the check constraint is
  -- what stops that quietly being widened to something easier to hit.
  threshold_metric text not null default 'confirmed_trials'
    check (threshold_metric in ('confirmed_trials')),

  decision    text not null default 'running'
    check (decision in ('running', 'keep', 'kill')),
  decided_at  timestamptz,
  notes       text
);

-- One experiment per name, case-insensitively — re-seeding or a double-submit
-- must not create a second row that splits the same channel's results in two.
create unique index if not exists channel_experiments_name_key
  on channel_experiments (lower(name));
create index if not exists channel_experiments_source_idx
  on channel_experiments (lower(utm_source));

-- RLS: server-side routes use the service-role key and bypass it. Default-deny
-- for the anon key the public site ships — these rows carry spend figures.
alter table channel_experiments enable row level security;

-- ── Seed: the ChatGPT Ads pilot ─────────────────────────────────────────────
-- Idempotent, so re-running the file cannot duplicate it. start_date is the day
-- the migration is applied; correct it in the UI if the pilot started earlier.
insert into channel_experiments
  (name, channel, utm_source, start_date, end_date, budget_cap, threshold, notes)
select
  'ChatGPT Ads pilot', 'ChatGPT Ads', 'chatgpt_ads',
  current_date, current_date + 60, 500, 2,
  'Keep if at least 2 confirmed trials land in the 60-day window. '
  || 'Tag the ads with utm_source=chatgpt_ads or nothing here can see them. '
  || 'Spend is entered by hand — there is no ChatGPT Ads API.'
where not exists (
  select 1 from channel_experiments where lower(name) = 'chatgpt ads pilot'
);
