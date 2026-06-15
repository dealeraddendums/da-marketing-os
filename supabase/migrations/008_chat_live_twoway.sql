-- 008_chat_live_twoway.sql — two-way live chat (chat-live-twoway.md)
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
-- Upgrades the notify-only escalation to real two-way: team replies in the
-- Slack thread, visitor sees it live in the widget (and replies back).

create table if not exists chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,
  status          text not null default 'bot' check (status in ('bot','live','closed')),
  slack_thread_ts text,        -- ts of the Slack alert that anchors the thread
  slack_channel   text,        -- channel id the alert posted to
  contact_email   text,
  contact_phone   text,
  page            text,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- One live conversation per browser session (find-or-create keys on this).
create unique index if not exists chat_conversations_session_idx on chat_conversations (session_id);
-- Slack Events maps an inbound thread reply back to its conversation by thread_ts.
create index if not exists chat_conversations_thread_idx on chat_conversations (slack_thread_ts);

create table if not exists chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations (id) on delete cascade,
  role            text not null check (role in ('visitor','bot','agent','system')),
  body            text not null,
  created_at      timestamptz not null default now()
);

-- Poll query: new agent/system messages for a conversation since a cursor.
create index if not exists chat_messages_conv_time_idx on chat_messages (conversation_id, created_at);
