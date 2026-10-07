-- 016_chat_hubspot_bridge.sql — live-chat hand-off into the HubSpot inbox.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- The visitor keeps OUR widget; on "talk to a person" the conversation is
-- published into HubSpot's Conversations inbox through a Custom Channel, and
-- agent replies come back to us by webhook (/api/chat/hubspot-events). See
-- live-chat-hubspot-handoff-spec.md (suite root) and docs/chat-hubspot-bridge.md.
--
-- Additive only: every existing Slack-era row and column keeps working, so a
-- conversation that went live on Slack before the switch finishes on Slack.

-- ── Which hand-off a conversation went live on ─────────────────────────────
-- NULL = never handed off (or handed off before this migration, i.e. Slack).
alter table chat_conversations
  add column if not exists handoff_provider text
    check (handoff_provider in ('slack','hubspot')),
  -- HubSpot's own thread id, learned from the first webhook for the thread.
  -- Our integrationThreadId is chat_conversations.id itself, so this is for
  -- operators (deep link into the inbox), not for routing replies.
  add column if not exists hubspot_thread_id text,
  add column if not exists contact_name text,
  add column if not exists dealership text,
  -- When the conversation went live. The widget's poll cursor starts here, so a
  -- reply sent before the visitor's widget connected is not skipped.
  add column if not exists live_at timestamptz;

-- ── Message extras ─────────────────────────────────────────────────────────
alter table chat_messages
  -- [{ name, mime, size, path }] — `path` is our storage object, never a
  -- HubSpot URL (those are not ours to hand to a browser).
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  -- The agent's display name from HubSpot ("Marlena"), shown above the bubble.
  add column if not exists sender_name text,
  -- HubSpot message id. HubSpot retries webhooks, so this is the dedupe key
  -- that keeps a retried reply from appearing twice in the widget.
  add column if not exists external_id text;

create unique index if not exists chat_messages_external_id_idx
  on chat_messages (external_id) where external_id is not null;

-- ── OAuth connection to HubSpot (single-tenant: portal 23896347) ───────────
-- The refresh token is stored ENCRYPTED (AES-256-GCM, key from
-- GOOGLE_TOKEN_ENC_KEY — the same at-rest key the Google connection uses).
-- Access tokens are never persisted.
create table if not exists hubspot_chat_connection (
  id                       uuid primary key default gen_random_uuid(),
  singleton                boolean not null default true,
  portal_id                text,
  scopes                   text[] not null default '{}',
  refresh_token_ciphertext text not null,
  refresh_token_iv         text not null,
  refresh_token_tag        text not null,
  -- Custom Channel wiring, filled once the channel account is connected.
  channel_id               text,
  channel_account_id       text,
  inbox_id                 text,
  status                   text not null default 'connected'
                             check (status in ('connected','revoked','error')),
  last_error               text,
  last_refresh_at          timestamptz,
  connected_at             timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create unique index if not exists hubspot_chat_connection_singleton_idx
  on hubspot_chat_connection (singleton);

-- ── Raw webhook capture ────────────────────────────────────────────────────
-- Several parts of HubSpot's custom-channel webhook are undocumented (whether
-- it is signed, the shape of agent attachments). Every delivery is kept here
-- verbatim so those questions are answered from evidence, and so a reply that
-- failed to relay can be replayed. The receiver trims rows older than 30 days
-- itself (this app has no purge cron).
create table if not exists chat_hubspot_events (
  id              uuid primary key default gen_random_uuid(),
  received_at     timestamptz not null default now(),
  event_type      text,
  signature_state text,          -- 'valid' | 'invalid' | 'absent'
  headers         jsonb not null default '{}'::jsonb,
  body            jsonb,
  relayed         boolean not null default false,
  error           text
);
create index if not exists chat_hubspot_events_received_idx on chat_hubspot_events (received_at);

-- Service-role only, like every other chat table (the widget never touches
-- Supabase directly).
alter table hubspot_chat_connection enable row level security;
alter table chat_hubspot_events enable row level security;
