-- 025_ai_visibility.sql — AI Visibility audit (admin → "AI Visibility" tab).
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- Measures whether AI assistants (ChatGPT, Gemini, Perplexity, Claude) mention
-- or cite DealerAddendums when dealers ask the questions our blog answers.
-- A weekly run asks every active prompt on every engine, and a deterministic
-- parser records who was mentioned and which domains were cited.
--
-- RLS is enabled with ZERO policies on every table (the house pattern since
-- migration 011): all access is server-side via the service-role key, which
-- bypasses RLS. Never add a permissive policy — raw engine answers and the
-- prompt list have no business being readable by the anon key the public
-- site ships.

-- ── The question list ─────────────────────────────────────────────────────────
create table if not exists ai_visibility_prompts (
  id          uuid primary key default gen_random_uuid(),
  prompt_text text not null,
  category    text not null default 'addendums'
                check (category in ('addendums','compliance','buyers_guide','pricing','competitors')),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Who the parser can recognise ──────────────────────────────────────────────
-- The parser matches answers against names + aliases (word-boundary,
-- case-insensitive) and domains (in answer text and engine citations).
create table if not exists ai_visibility_competitors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  domains    text[] not null default '{}',
  aliases    text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── One row per audit run ─────────────────────────────────────────────────────
create table if not exists ai_visibility_runs (
  id                 uuid primary key default gen_random_uuid(),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  status             text not null default 'running'
                       check (status in ('running','ok','partial','error')),
  prompt_count       int not null default 0,
  cost_estimate_usd  numeric(8,4) not null default 0,
  notes              text
);

create index if not exists ai_visibility_runs_started_idx
  on ai_visibility_runs (started_at desc);

-- ── One row per prompt × engine per run ───────────────────────────────────────
create table if not exists ai_visibility_results (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references ai_visibility_runs(id) on delete cascade,
  prompt_id             uuid not null references ai_visibility_prompts(id) on delete cascade,
  engine                text not null check (engine in ('openai','gemini','perplexity','anthropic')),
  model                 text not null default '',
  raw_answer            text not null default '',
  da_mentioned          boolean not null default false,
  da_cited_url          text,
  competitors_mentioned text[] not null default '{}',
  cited_domains         text[] not null default '{}',
  position_rank         int,
  latency_ms            int,
  token_cost_usd        numeric(8,5),
  error                 text,            -- set when the engine call failed after retry
  created_at            timestamptz not null default now()
);

create index if not exists ai_visibility_results_run_idx
  on ai_visibility_results (run_id);
create index if not exists ai_visibility_results_prompt_idx
  on ai_visibility_results (prompt_id, created_at desc);

alter table ai_visibility_prompts     enable row level security;
alter table ai_visibility_competitors enable row level security;
alter table ai_visibility_runs        enable row level security;
alter table ai_visibility_results     enable row level security;

-- ── Seed: competitors ─────────────────────────────────────────────────────────
-- ⚠️ Best-effort seed covering the addendum / window-sticker / buyers-guide /
-- dealer-compliance space plus the adjacent DMS & data vendors dealers name in
-- the same breath. Fully editable in the admin tab (Prompt manager → Competitors);
-- Allan should review. Aliases are matched as whole words — keep them distinctive
-- (e.g. never a bare "Reynolds").
insert into ai_visibility_competitors (name, domains, aliases) values
  ('ComplyAuto',            '{complyauto.com}',          '{}'),
  ('Carketa',               '{carketa.com}',             '{}'),
  ('AutoRevo',              '{autorevo.com}',            '{}'),
  ('Frazer',                '{frazer.com}',              '{"Frazer DMS"}'),
  ('DealerCenter',          '{dealercenter.net}',        '{}'),
  ('Wayne Reaves',          '{waynereaves.com}',         '{"Wayne Reaves Software"}'),
  ('vAuto',                 '{vauto.com}',               '{}'),
  ('CARFAX',                '{carfax.com}',              '{Carfax}'),
  ('CDK Global',            '{cdkglobal.com}',           '{CDK}'),
  ('Reynolds and Reynolds', '{reyrey.com}',              '{"Reynolds & Reynolds"}'),
  ('Dealertrack',           '{dealertrack.com}',         '{DealerTrack}'),
  ('Versa-Tags',            '{versatags.com}',           '{"Versa Tags",VersaTags}'),
  ('MBR Marketing',         '{mbrmarketing.com}',        '{}'),
  ('Donkey Auto Products',  '{donkeyautoproducts.com}',  '{}'),
  ('Dealer Specialties',    '{dealerspecialties.com}',   '{}'),
  ('AutoManager',           '{automanager.com}',         '{WebManager,DeskManager}')
on conflict (name) do nothing;

-- ── Seed: prompts ─────────────────────────────────────────────────────────────
-- Phrased the way a dealer would actually ask an AI assistant. sort_order
-- groups by category; the admin tab can re-order/edit/deactivate.
insert into ai_visibility_prompts (prompt_text, category, sort_order) values
  -- addendums
  ('What software do car dealerships use to create vehicle addendums?',                          'addendums',    10),
  ('Best addendum printing software for franchise dealers',                                      'addendums',    20),
  ('How do car dealers print window sticker addendums for new vehicles?',                        'addendums',    30),
  ('What is a dealer addendum sticker and how do dealerships make them?',                        'addendums',    40),
  ('Software to manage dealer-installed accessories pricing on window stickers',                 'addendums',    50),
  ('How can my dealership automatically generate addendum labels from our inventory feed?',      'addendums',    60),
  ('Best way to show required vs suggested dealer add-ons on a vehicle addendum',                'addendums',    70),
  ('Dealer addendum template software with vehicle inventory integration',                       'addendums',    80),
  ('Window sticker software for car dealer groups with multiple rooftops',                       'addendums',    90),
  -- compliance
  ('How do dealers stay compliant with the FTC CARS rule on add-on pricing?',                    'compliance',  110),
  ('Is it legal for car dealers to add an addendum sticker next to the window price?',           'compliance',  120),
  ('How should dealerships disclose dealer-installed options to stay FTC compliant?',            'compliance',  130),
  ('California CARS Act requirements for dealer add-on pricing disclosure',                      'compliance',  140),
  ('What are the rules for advertising dealer add-ons and accessories on used cars?',            'compliance',  150),
  -- buyers_guide
  ('Buyer''s Guide compliance software for used car dealers',                                    'buyers_guide', 210),
  ('How do used car dealers print FTC Buyers Guides?',                                           'buyers_guide', 220),
  ('What has to be on the FTC Buyers Guide window form for a used car?',                         'buyers_guide', 230),
  ('Software that prints both window stickers and FTC Buyers Guides for dealerships',            'buyers_guide', 240),
  -- pricing
  ('How much does dealer addendum software cost?',                                               'pricing',     310),
  ('Affordable window sticker printing solution for a small franchise dealership',               'pricing',     320),
  ('Is there a free tool for dealers to make addendum stickers?',                                'pricing',     330),
  ('DealerAddendums pricing and reviews',                                                        'pricing',     340),
  -- competitors
  ('DealerAddendums alternatives for printing vehicle addendums',                                'competitors', 410),
  ('Best companies for dealership window sticker and addendum printing',                         'competitors', 420),
  ('Who makes addendum stickers for car dealerships?',                                           'competitors', 430)
on conflict do nothing;
