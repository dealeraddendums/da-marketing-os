# Live chat → HubSpot inbox (the Steven bridge)

> Supersedes the Slack console in `chat-live-twoway.md` once `CHAT_HANDOFF_PROVIDER=hubspot`.
> Planning spec: `live-chat-hubspot-handoff-spec.md` (suite root). Built 2026-10-07.

## Flow
Visitor ↔ Steven (`/api/chat`) → "Talk to a human" (button **or** a typed request) →
`escalateLead()` publishes the whole Steven conversation + contact/page/UTM context into the HubSpot
inbox as the first message of a thread → conversation flips to `live`, Steven goes quiet → agent replies
in HubSpot → HubSpot webhooks `/api/chat/hubspot-events` → stored as `role='agent'` → the widget shows it
on its 3-second poll. Visitor messages and files go back through `relayVisitorMessage()`.

- **Threading:** the channel uses `INTEGRATION_THREAD_ID`; our `chat_conversations.id` IS the thread id,
  so replies route back with no lookup table. `hubspot_thread_id` is HubSpot's own id, for reference.
- **Contact logging:** the visitor is sent as `HS_EMAIL_ADDRESS` when we have an email, which is what
  makes HubSpot associate the thread with the contact. No email → an opaque `web-{session}` id.
- **Provider per conversation:** `handoff_provider` records where a chat went live; later messages
  follow it, so flipping the switch never splits a live chat. HubSpot publish failure → Slack → the
  notify-only webhook/email fallbacks.
- **Files:** visitor upload → private Supabase bucket `chat-attachments` → HubSpot Files (PRIVATE,
  `/chat-attachments`) → attached by `fileId`. Agent attachments are downloaded from the webhook and
  copied into the same bucket. The widget only ever sees `/api/chat/file` links, which sign on demand.
  Allowed: images, PDF, txt/csv, Word, Excel; 10 MB each.

## Pieces
| Piece | Where |
|---|---|
| HubSpot app (project, OAuth, private distribution) | `hubspot-app/` |
| Env + flags | `src/lib/hubspot-chat/config.ts` |
| OAuth (refresh token encrypted, `hubspot_chat_connection`) | `src/lib/hubspot-chat/oauth.ts`, `/api/hubspot-chat/oauth/{start,callback}` |
| Publish / Files / signature v3 | `src/lib/hubspot-chat/client.ts` |
| Provider dispatch | `src/lib/chat-handoff.ts` |
| Webhook receiver (+ raw capture in `chat_hubspot_events`, 30 days) | `/api/chat/hubspot-events` |
| Channel wiring (admin) | `POST /api/hubspot-chat/setup` `{action}` |
| Schema | migration `016_chat_hubspot_bridge.sql` |

## Env (`.env.production` on the marketing box)
`HUBSPOT_CHAT_CLIENT_ID`, `HUBSPOT_CHAT_CLIENT_SECRET`, `HUBSPOT_CHAT_APP_ID`,
`HUBSPOT_DEVELOPER_API_KEY`, `HUBSPOT_CHAT_WEBHOOK_TOKEN` (random; rides in the webhook URL),
`HUBSPOT_CHAT_CHANNEL_ID`, `HUBSPOT_CHAT_ACCOUNT_HOMEPAGE`, `HUBSPOT_CHAT_ACCOUNT_INAPP`,
`CHAT_HANDOFF_PROVIDER=hubspot` (anything else = Slack). Refresh token is NOT in env — it's in the DB.

## Setup order
1. `hs project upload` from `hubspot-app/`; copy client id/secret + app id; developer API key from
   Development → Keys.
2. Install the app into portal 23896347 (Distribution tab, or `/api/hubspot-chat/oauth/start` as admin).
3. `setup {action:'register'}` → channel id → env. `{action:'inboxes'}` → pick the inbox.
   `{action:'connect', inboxId, surface:'homepage'}` → channel account id → env. Restart.
4. Flip `CHAT_HANDOFF_PROVIDER=hubspot`.

## Known gaps / undocumented by HubSpot (see chat_hubspot_events for evidence)
- Whether webhooks carry `X-HubSpot-Signature-v3` — the receiver requires the URL token and verifies a
  signature when one is present (`signature_state` records which).
- Agent-attachment shape in the webhook — `downloadAgentAttachment()` accepts URL or Files id.
- In-app (da-platform) surface: its channel account exists in config, but the relay waits on Phase 2a.
