-- 019: the HubSpot agent's email on agent chat messages (2026-10-09), so the
-- homepage widget can show that staff member's headshot on takeover (resolved
-- server-side through da-platform; the email itself is never sent to visitors).
alter table public.chat_messages add column if not exists sender_email text;
