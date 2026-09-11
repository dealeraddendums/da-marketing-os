-- 011_rls_hero_tables.sql — close the last two RLS gaps.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- hero_cache and generated_variations (migration 006) are the only two tables
-- in the schema without Row Level Security. Every other table is default-deny
-- (009 for the Google tables, 010 for the eleven older ones); these two were
-- missed when RLS was rolled across the fleet by hand.
--
-- Nothing functional changes. Both tables are written and read exclusively by
-- lib/hero-engine.ts through the service-role client (`supabase` in
-- lib/supabase.ts), and the service role bypasses RLS. The exported
-- `supabaseAnon` client has no consumers anywhere in src/, so no code path
-- reads either table with the anon key.
--
-- What it stops: the anon key ships in the public site's JavaScript, so
-- without RLS anyone could read the whole generation audit log — every prompt
-- input, every model output including the ones that failed validation, and the
-- signals attached to individual visitors.
--
-- No policies, deliberately: default-deny is the intent, matching 009's model.

alter table hero_cache           enable row level security;
alter table generated_variations enable row level security;
