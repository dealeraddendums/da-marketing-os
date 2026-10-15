-- 020 — website URL on the trial signup lead (2026-10-15)
-- The signup form requires it; /api/leads stores it normalized (see
-- src/lib/website-url.ts) and confirm passes it to DA Platform, which puts it
-- on dealers.website_url (da-platform migration 177).

alter table public.marketing_leads
  add column if not exists website_url text;
