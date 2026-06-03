-- 004_lead_attribution.sql
-- Google traffic attribution on marketing leads — persist first-touch acquisition
-- source + (where Google passes it) the paid search term on every signup.
--
-- Apply via the Supabase SQL editor (project huqohncglbshwuzeguvb) or `supabase db push`.
--
-- Note: marketing_leads (migration 001) already has `utm_term` and `landing_page`,
-- so those two ADDs are no-ops via IF NOT EXISTS. The dedicated `utm_source` /
-- `utm_campaign` columns are distinct from the existing `source` (which stores the
-- lead channel, e.g. 'website') and the legacy `campaign` column.

alter table marketing_leads
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term     text,
  add column if not exists utm_content  text,
  add column if not exists gclid        text,
  add column if not exists referrer     text,
  add column if not exists landing_page text;
