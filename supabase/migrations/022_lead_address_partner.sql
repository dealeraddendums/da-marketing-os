-- 022_lead_address_partner.sql
-- Signup-form overhaul (2026-11-03): the form now looks the business up by
-- name + ZIP (Google Places via the platform proxy, with a title-case + ZIP
-- fallback) and carries the corrected street address / city / state through to
-- DA Platform provisioning. Store what was submitted on the lead too.
--
-- Also formalizes `brand`, which was added straight to the database with
-- commit 864ac15 (PR #1) and never got a migration file — a no-op here.
--
-- account_kind needs no change: it is plain text (005), and the new
-- 'partner' kind (Partner / Reseller tab → restyler group + first rooftop on
-- the platform side) stores as-is.
--
-- Apply via the Supabase SQL editor (project huqohncglbshwuzeguvb) or the
-- Management API.

alter table marketing_leads add column if not exists brand   text;
alter table marketing_leads add column if not exists address text;
alter table marketing_leads add column if not exists city    text;
alter table marketing_leads add column if not exists state   text;
