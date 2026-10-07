-- 017_chat_company_log.sql — file live chats on the dealer's COMPANY timeline.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- HubSpot logs a custom-channel thread to the CONTACT only (verified
-- 2026-10-07: closed test chat never reached the company's Activity). The
-- bridge therefore writes its own note on the contact's company(ies) and keeps
-- it current as the chat goes on (lib/chat-crm-log.ts).
alter table chat_conversations
  -- The summary + Steven transcript published as the thread's first message.
  -- Bot turns are not stored as chat_messages, so this is the only copy.
  add column if not exists handoff_summary text,
  -- HubSpot contact the inbox resolved for this thread (from the webhook's
  -- recipient actor id V-<contactId>), so no email search is needed.
  add column if not exists hubspot_contact_id text,
  -- The company-timeline note this conversation maintains.
  add column if not exists crm_note_id text;
