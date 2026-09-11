-- 013_ga_client_id.sql — carry GA4 identity from form submit to confirmation.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- Why this exists
-- ---------------
-- A trial signup is only real once the applicant confirms their email (Layer 0,
-- migration 010), and that click arrives from their email client — a DIFFERENT
-- GA4 session from the one that produced the lead, usually with no referrer at
-- all. Firing the conversion client-side on the confirmation page would
-- therefore attribute every trial to Direct/email and destroy exactly the
-- number this whole exercise exists to produce: cost per trial by channel.
--
-- So the conversion is sent server-side via the GA4 Measurement Protocol at the
-- moment of confirmation, using the GA4 identifiers captured in the ORIGINAL
-- session when the form was submitted. These two columns are that hand-off.
--
-- Both are nullable and non-identifying: a GA4 client id is a random
-- first-party cookie value, not a person. When they are absent (cookie blocked,
-- consent declined, GTM not yet loaded) the conversion is still sent with a
-- synthetic id so it is COUNTED — attribution degrades, the count does not.

alter table marketing_leads
  add column if not exists ga_client_id  text,
  add column if not exists ga_session_id text;

comment on column marketing_leads.ga_client_id is
  'GA4 client id from the _ga cookie at form submit, used to attribute the '
  'server-side trial_signup conversion back to the originating session.';
comment on column marketing_leads.ga_session_id is
  'GA4 session id from the _ga_<container> cookie at form submit.';
