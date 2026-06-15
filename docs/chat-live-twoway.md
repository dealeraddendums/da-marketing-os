# Two-way live chat — reply from Slack

> Decision (Allan, 2026-06-15): upgrade the notify-only escalation to **real two-way** — when a visitor
> taps "Talk to a human," the team replies **inside the Slack thread** and the visitor sees it live in the
> widget (and can reply back). **Slack IS the agent console** — no separate UI to build, the team already
> lives there. Builds on the shipped chat widget + `/api/chat/escalate`.

## Flow
visitor ↔ bot (existing `/api/chat`) → **"Talk to a human"** → escalation posts a Slack message (bot
token, this becomes the **thread parent**) + flips the conversation to **live** → team replies in the
thread → Slack Events → relayed into the widget → visitor replies → persisted + posted back into the same
Slack thread. Once live, the **bot stops auto-answering**.

## Slack app (Allan configures — replaces the Incoming Webhook for escalations)
Threading + reading replies needs a real Slack app, not just the Incoming Webhook:
- **Bot token** (`xoxb-…`), scopes `chat:write` + `channels:history` (or `groups:history` for a private
  channel). Invite the bot to the alerts channel.
- **Events API**: Request URL `https://www.dealeraddendums.com/api/chat/slack-events`; subscribe to
  `message.channels` (+ `message.groups` if private). Save the **Signing Secret**.
- Env on the marketing box: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_ALERTS_CHANNEL` (channel id).
  Keep `SLACK_LEADS_WEBHOOK_URL` only as a fallback alert; threading uses the bot token.

## Data model (Supabase `huqohncglbshwuzeguvb`, migration 008)
- `chat_conversations`: id, session_id, status (`bot`|`live`|`closed`), slack_thread_ts, slack_channel,
  contact_email, contact_phone, page, created_at, last_message_at.
- `chat_messages`: id, conversation_id, role (`visitor`|`bot`|`agent`|`system`), body, created_at.

## Endpoints
- **POST `/api/chat/escalate`** (upgrade): find/create the conversation, set `status='live'`, post the
  alert via `chat.postMessage` (bot token) → store the returned `ts` as `slack_thread_ts` + the channel.
  Keep the transcript in the alert body.
- **POST `/api/chat/slack-events`** (new): the Slack Events handler. Verify the **signing secret** +
  answer the `url_verification` challenge. On a thread reply whose `thread_ts` maps to a conversation —
  and **not** from our own bot (ignore `bot_id`/self → loop guard) — insert a `role='agent'` message.
  Return 200 within 3s (Slack retries otherwise; defer heavy work).
- **POST `/api/chat/message`** (new): a visitor message while `status='live'` → persist `role='visitor'`
  + relay into the Slack thread (`chat.postMessage` with `thread_ts`). In `bot` mode the widget keeps
  using the existing `/api/chat` streaming.
- **GET `/api/chat/poll?conversation=&after=`** (new): returns new `agent`/`system` messages since
  `after` (server-side, service role). v1 delivery = the widget polls this every ~3s while live (simplest;
  no client Supabase/RLS). Supabase Realtime is a later upgrade for instant push.

## Widget (extend the shipped chat widget)
- After escalation → **live mode**: show "You're connected to our team," poll `/api/chat/poll` every ~3s,
  render incoming `agent`/`system` messages. Route the input to `/api/chat/message` (NOT the bot) while
  live. The visitor converses; the agent sees it in the Slack thread.
- Bot coexistence: once live, the AI stops auto-replying. (v1 stays live; optional later: agent hands back
  to bot or a "close chat" control.)

## Email-the-transcript fallback (visitor has left)
v1 delivery is live polling while the tab is open — if the visitor leaves before the agent replies, the
reply lands in Slack but no live session receives it. Fallback so nothing is lost:
- Schema: `chat_conversations += last_seen_at`; `chat_messages += emailed_at`.
- **Heartbeat:** `/api/chat/poll` updates `last_seen_at` on every call (the widget polls ~3s while live,
  so `last_seen_at` = "is the visitor still here").
- **Capture an email:** on entering live mode, if no `contact_email` yet, the assistant asks once for the
  best email "in case we get disconnected" — optional, never required — stored on the conversation (also
  fixes the Slack alert's "Contact: not given").
- In `/api/chat/slack-events`, after inserting a `role='agent'` message: if `last_seen_at` is stale
  (> ~45s → visitor gone) AND `contact_email` is set AND nothing emailed in the last ~2 min → **Mandrill**
  email (agent reply + recent transcript), from `noreply@`, **reply-to `support@dealeraddendums.com`** so
  the visitor can continue by email; set `emailed_at`; batch rapid replies into one email. No email on
  file → skip (the agent already sees "not given" in the thread).

## Guardrails
- Slack events **signature-verified**; ignore our own bot's messages (loop guard); ack 200 fast.
- Only relay visitor↔agent text — never bot/system noise back into Slack.
- Reuse the existing chat rate-limit. Conversation/message rows are sales-chat content (no special PII
  gate beyond session scoping).

## Verify (end-to-end)
escalate → a **threaded** Slack alert; reply in that thread → shows in the widget within ~3s; a visitor
reply → shows in the Slack thread; the bot no longer auto-answers once live; an unsigned POST to
`/api/chat/slack-events` is rejected.
