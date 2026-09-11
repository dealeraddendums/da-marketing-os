-- 012_analyst.sql — Claude-powered analysis layer ("Analyst").
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- One row per analysis run. Both the INPUT (snapshot) and the OUTPUT (brief)
-- are stored, which is the point: a brief is only auditable if you can see the
-- numbers it was reasoning over, and the Google APIs will not return this
-- period's data again once the window moves.
--
-- `raw_response` keeps the model's text when JSON parsing fails, so a
-- parse_error run is inspectable instead of lost. It is nullable because a
-- successful run has nothing extra to keep beyond `brief`.

create table if not exists analyses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- How the run was started. Constrained so a future producer (a cron, or an
  -- Approvals-gated action) has to declare itself rather than silently
  -- widening the meaning of 'manual'.
  trigger     text not null default 'manual'
                check (trigger in ('manual', 'scheduled', 'webhook')),

  -- The reporting window the snapshot covers, e.g.
  -- {"startDate":"2026-08-13","endDate":"2026-09-11","days":30}
  date_range  jsonb not null default '{}'::jsonb,

  snapshot    jsonb not null,
  brief       jsonb,
  raw_response text,

  model       text not null,
  status      text not null default 'ok'
                check (status in ('ok', 'parse_error', 'error')),
  error       text
);

-- The UI's two reads are "latest" and "the history list", both newest-first.
create index if not exists analyses_created_at_idx
  on analyses (created_at desc);

-- RLS: reached only through server-side routes using the service-role key,
-- which bypasses RLS. Enabling it with no permissive policy means the anon key
-- that ships in the public site's JavaScript can never read these rows — which
-- matters more here than for most tables, because a brief contains full
-- campaign spend and the snapshot contains the whole marketing dataset.
alter table analyses enable row level security;
