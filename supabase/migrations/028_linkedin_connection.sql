-- 028_linkedin_connection.sql — LinkedIn member posting for the Social Queue.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- Mirrors google_connection (migration 009): a SINGLE row holding Allan's
-- member grant, tokens encrypted at rest (AES-256-GCM, key from
-- LINKEDIN_TOKEN_ENC_KEY, falling back to GOOGLE_TOKEN_ENC_KEY — never in this
-- database). Member-profile scopes only (openid profile w_member_social); the
-- organization scope was deliberately NOT requested (Community Management API
-- access was skipped), so this can only ever post AS the member.
--
-- Unlike Google, LinkedIn access tokens are long-lived (~60 days), so the
-- access token itself is persisted (encrypted) — there is no cheap "refresh on
-- every call" path. The refresh token columns are nullable: LinkedIn only
-- issues refresh tokens to apps with programmatic refresh enabled; without one
-- the fix at expiry is Reconnect (the admin badge warns 14 days out).

create table if not exists linkedin_connections (
  id                        uuid primary key default gen_random_uuid(),
  singleton                 boolean not null default true,
  member_urn                text,            -- urn:li:person:{sub from /v2/userinfo}
  display_name              text,            -- "connected as <name>" on the badge
  scopes                    text[] not null default '{}',
  access_token_ciphertext   text not null,   -- base64, AES-256-GCM
  access_token_iv           text not null,   -- base64, 12-byte nonce
  access_token_tag          text not null,   -- base64, 16-byte auth tag
  expires_at                timestamptz not null,
  refresh_token_ciphertext  text,            -- null when LinkedIn issued no refresh token
  refresh_token_iv          text,
  refresh_token_tag         text,
  refresh_token_expires_at  timestamptz,
  status                    text not null default 'connected'
                              check (status in ('connected','expired','revoked','error')),
  last_error                text,
  last_refresh_at           timestamptz,
  connected_at              timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Exactly one connection row, ever — a reconnect updates in place.
create unique index if not exists linkedin_connections_singleton_idx
  on linkedin_connections (singleton);

-- RLS on with ZERO policies (default-deny, the house pattern): server-side
-- service-role access only. Never add a permissive policy.
alter table linkedin_connections enable row level security;

-- ── social_posts: publish results ────────────────────────────────────────────
-- Approve now publishes directly to LinkedIn. Record what came back, and give
-- failures a visible state instead of silently staying 'approved'.
alter table social_posts add column if not exists post_urn   text;  -- x-restli-id from rest/posts
alter table social_posts add column if not exists permalink  text;  -- linkedin.com/feed/update/{urn}/
alter table social_posts add column if not exists post_error text;  -- last publish failure, shown in admin

alter table social_posts drop constraint if exists social_posts_status_check;
alter table social_posts add constraint social_posts_status_check
  check (status in ('pending','approved','rejected','published','failed'));
