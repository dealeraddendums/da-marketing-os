-- 009_google_integration.sql — Google Ads / GA4 / Search Console integration.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- Phase 1 is READ-ONLY against Google. The proposed_changes / change_audit
-- tables are the foundation Phase 2 (Ads writes) and Phase 3 (AI
-- recommendations) will sit on; in Phase 1 nothing writes to them, so the
-- Approvals panel is deliberately empty.
--
-- Single-tenant: this manages Allan's own Google accounts, so google_connection
-- holds exactly one row (enforced by a partial unique index below).

-- ── OAuth connection ────────────────────────────────────────────────────────
-- The refresh token is stored ENCRYPTED (AES-256-GCM, key from
-- GOOGLE_TOKEN_ENC_KEY in the environment — never in this database). Even with
-- the service-role key, a database dump alone does not yield a usable Google
-- credential. Access tokens are never persisted; they are fetched on demand and
-- held in memory only.
create table if not exists google_connection (
  id                       uuid primary key default gen_random_uuid(),
  singleton                boolean not null default true,
  account_email            text,
  scopes                   text[] not null default '{}',
  refresh_token_ciphertext text not null,   -- base64, AES-256-GCM
  refresh_token_iv         text not null,   -- base64, 12-byte nonce
  refresh_token_tag        text not null,   -- base64, 16-byte auth tag
  status                   text not null default 'connected'
                             check (status in ('connected','revoked','error')),
  last_error               text,
  last_refresh_at          timestamptz,
  connected_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Exactly one connection row, ever. A second "Connect Google" run updates the
-- existing row rather than leaving two credentials where a later reader picks
-- an arbitrary one.
create unique index if not exists google_connection_singleton_idx
  on google_connection (singleton);

-- ── Approval queue (Phase 2/3 producers; Phase 1 ships it empty) ────────────
create table if not exists proposed_changes (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- What kind of change this is. Constrained so a typo from a future producer
  -- fails loudly at insert instead of silently creating a category the UI
  -- cannot render or the applier cannot dispatch on.
  type          text not null check (type in (
                  'budget_change','keyword_add','keyword_negative',
                  'bid_change','pause_ad','enable_ad','ad_copy_change'
                )),

  -- Which Google object this acts on. Kept as plain text ids (not FKs — they
  -- are Google's, not ours) plus a free-form label for the UI.
  target_customer_id text,
  target_campaign_id text,
  target_ad_group_id text,
  target_resource    text,           -- full Google resource name when known
  target_label       text,           -- human-readable, e.g. "Brand — Search"

  -- The whole point of the queue: what it is now vs what it would become.
  before_json   jsonb,
  after_json    jsonb,
  summary       text,                -- one-line description for the list view
  rationale     text,                -- Phase 3: why the AI proposed it

  source        text not null default 'system'
                  check (source in ('system','ai','manual')),

  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','applied','failed')),
  approved_at   timestamptz,
  rejected_at   timestamptz,
  applied_at    timestamptz,
  decided_by    text,
  error         text
);

create index if not exists proposed_changes_status_idx
  on proposed_changes (status, created_at desc);

-- ── Audit log ───────────────────────────────────────────────────────────────
-- Every state transition, including the Phase 1 no-op applies, so the trail is
-- continuous from the day the queue exists rather than starting when Phase 2
-- turns on.
create table if not exists change_audit (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  proposed_change_id uuid references proposed_changes (id) on delete set null,
  action             text not null check (action in (
                       'proposed','approved','rejected','apply_attempted',
                       'applied','apply_failed','apply_skipped_phase1'
                     )),
  actor              text,          -- 'admin' (single-tenant portal) or 'system'
  detail             jsonb,
  created_by_ip      text
);

create index if not exists change_audit_change_idx
  on change_audit (proposed_change_id, created_at desc);

-- RLS: these tables are reached only through server-side routes using the
-- service-role key, which bypasses RLS. Enabling it with no permissive policy
-- means the anon key (which the public site ships) can never read a Google
-- credential or the change queue.
alter table google_connection enable row level security;
alter table proposed_changes  enable row level security;
alter table change_audit      enable row level security;
