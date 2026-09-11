-- 010_lead_confirmation.sql — retroactive capture of live-schema drift.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- ⚠️ This migration is a NO-OP against production. Everything below already
-- exists there, applied by hand in the SQL editor without a migration file.
-- It exists so `supabase/migrations/` alone rebuilds a schema that matches
-- prod — before this file, a rebuild from 001–009 produced a database where
-- self-serve signup breaks at runtime (see part 1) and every table is
-- world-readable through the anon key (see part 2).
--
-- Verified 2026-09-08 by applying 001–010 to a scratch PostgreSQL 16 database
-- and diffing columns, indexes, constraints, triggers, functions, sequences,
-- views and RLS state against the live project: zero differences.

-- ── 1. Self-serve signup hardening (shipped 2026-09-03, no migration) ───────
-- Layer 0 of the fake-trial-signup fix: a lead row is written on submit and a
-- dealer is only provisioned when the recipient clicks the emailed confirm
-- link. These columns are load-bearing for that flow — src/app/api/leads/
-- route.ts writes all five, and src/lib/lead-confirm.ts keys confirmation and
-- its resend throttle on confirm_token / confirm_sent_at.
alter table marketing_leads add column if not exists zip             text;
alter table marketing_leads add column if not exists confirm_token   text;
alter table marketing_leads add column if not exists confirm_sent_at timestamptz;
alter table marketing_leads add column if not exists confirmed_at    timestamptz;
alter table marketing_leads add column if not exists source_ip       text;

-- Partial, so the many confirmed/expired leads that carry a NULL token do not
-- collide with each other. The uniqueness is what makes confirmation
-- single-use: lead-confirm.ts clears the token in an UPDATE predicated on it,
-- so a double-clicked link updates zero rows instead of provisioning twice.
create unique index if not exists marketing_leads_confirm_token_key
  on marketing_leads (confirm_token)
  where confirm_token is not null;

-- ── 2. Row Level Security on the pre-009 tables ─────────────────────────────
-- Migration 009 enabled RLS on its own three tables and documented the
-- reasoning; the other eleven were switched on by hand at some point and no
-- migration ever recorded it. Same model as 009: these tables are reached only
-- by server-side routes using the service-role key, which bypasses RLS.
-- Enabling it with NO permissive policy makes the anon key the public site
-- ships default-deny — it can never read a stored Google/GBP credential, a
-- lead, or a chat transcript.
--
-- ENABLE ROW LEVEL SECURITY is idempotent, so this is safe to re-run.
alter table ab_events           enable row level security;
alter table personalization_log enable row level security;
alter table marketing_leads     enable row level security;
alter table gbp_credentials     enable row level security;
alter table gbp_reviews         enable row level security;
alter table review_campaigns    enable row level security;
alter table review_requests     enable row level security;
alter table private_feedback    enable row level security;
alter table reputation_settings enable row level security;
alter table chat_conversations  enable row level security;
alter table chat_messages       enable row level security;

-- Deliberately NOT here: hero_cache and generated_variations, the only two
-- tables still without RLS. Turning those on is a real change to production,
-- not drift capture, so it is migration 011.
