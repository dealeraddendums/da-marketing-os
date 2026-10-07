-- 018_chat_tickets.sql — selective ticketing for website chats.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
-- A ticket is created ONLY when a person presses "Make this a ticket" on the
-- HubSpot contact card; one ticket per conversation.
alter table chat_conversations
  add column if not exists hubspot_ticket_id text,
  add column if not exists ticketed_at timestamptz;
