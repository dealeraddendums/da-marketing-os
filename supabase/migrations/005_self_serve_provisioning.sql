-- 005_self_serve_provisioning.sql
-- Self-serve signup → DA Platform provisioning (Marketing OS Phase 5).
-- After saving a marketing_lead, /api/leads calls DA Platform's
-- POST /api/self-serve/signup, which creates the Trial dealer/group. Store the
-- returned ids + outcome on the lead row so marketing analytics can join a lead
-- to the DA Platform record it became.
--
-- Apply via the Supabase SQL editor (project huqohncglbshwuzeguvb) or `supabase db push`.

alter table marketing_leads add column if not exists account_kind     text;  -- 'single' | 'group'
alter table marketing_leads add column if not exists da_dealer_id      text;  -- DA Platform dealer_id (ss_*) when single
alter table marketing_leads add column if not exists da_group_id       text;  -- DA Platform group UUID when group
alter table marketing_leads add column if not exists provision_status  text;  -- 'provisioned' | 'existing' | 'failed' | 'skipped'
