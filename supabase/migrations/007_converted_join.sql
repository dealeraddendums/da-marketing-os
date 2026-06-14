-- 007_converted_join.sql — marketing-attributed trial→paid join (converted-join.md, C1)
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
-- `status` already exists (default 'new'); we reuse the 'converted' value.

alter table marketing_leads add column if not exists converted_at timestamptz; -- from DA Platform
alter table marketing_leads add column if not exists plan         text;        -- plan tier at conversion (optional)
alter table marketing_leads add column if not exists mrr          numeric;     -- monthly value, read-only from da-billing via DA Platform (optional)

create index if not exists marketing_leads_converted_idx on marketing_leads (converted_at);
