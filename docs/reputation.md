# Reputation Manager — DA Marketing OS

Internal tool for DealerAddendums staff to manage DA's **own** Google Business
Profile reputation: monitor reviews, send review requests to active dealers, and
reply to reviews with AI assistance.

> **Status:** GBP API access is **pending Google approval**, so the Google layer
> is **STUBBED** (mock reviews). Everything else — inbox, AI drafts, reply
> workflow, campaigns, tracking, private feedback — is fully functional now.

---

## Routes

| Path | Auth | Purpose |
| --- | --- | --- |
| `/reputation` | admin | Dashboard: stats + recent reviews + quick actions |
| `/reputation/reviews` | admin | Full review inbox (filter/sort, slide-over, AI draft, reply) |
| `/reputation/requests` | admin | Review-request campaigns + history |
| `/reputation/settings` | admin | GBP connection status, review URL, sync, email preview |
| `/reputation/feedback/[requestId]` | **public** | Private negative-feedback form (linked from campaign emails) |

Admin pages live under the `src/app/reputation/(admin)/` route group; its
`layout.tsx` enforces auth (redirects to `/admin` if the `da_admin_auth` cookie
is missing). The public feedback page sits outside the group so it is not gated.

**Auth note:** the `da_admin_auth` cookie path was widened from `/admin` to `/`
(in `app/api/admin-auth/route.ts`) so the single Marketing OS admin login also
gates `/reputation/*`. Existing sessions re-authenticate once on first visit.

The "Reputation" entry in the Marketing OS topbar (`marketing-dashboard.jsx`) is
a plain link to `/reputation` (not an in-SPA tab).

---

## API routes (`src/app/api/reputation/*`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/gbp/sync` | `fetchReviewsFromGoogle()` → upsert into `gbp_reviews` |
| POST | `/gbp/reply` | `postReplyToGoogle()` → set `reply_comment`, `status='replied'` |
| DELETE | `/gbp/reply` | `deleteReplyFromGoogle()` → clear reply fields |
| POST | `/gbp/connect` | **stub** → `{ status:'pending', message }` |
| GET | `/gbp/callback` | **stub** → `{ status:'pending', message }` |
| POST | `/ai-draft` | Streams a Claude reply; persists to `gbp_reviews.ai_draft` |
| PATCH | `/reviews` | Update review workflow status (read/flagged/…) |
| GET | `/requests/preview?segment=` | Recipient count for a segment (reads DA Platform) |
| POST | `/requests/send` | Create campaign + requests, send Resend emails |
| GET/POST | `/settings` | Read/write the Google review URL |
| POST | `/feedback` | **public** — insert `private_feedback` + internal alert |
| GET | `/track/open/[requestId]` | 1×1 pixel; records open + bumps campaign `total_opened` |
| GET | `/track/click/[requestId]?to=positive\|negative` | Records click, redirects to Google review URL (positive) or feedback page (negative) |
| POST | `/api/cron/sync-reviews` | Cron entry; auth `x-api-key: $DA_CRON_KEY` |

---

## GBP stub → real API (single file to change)

`src/lib/gbp.ts` is the only place that talks to Google. To activate the real
Google Business Profile API once Google approves access:

1. Add to `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REDIRECT_URI`, and `GBP_LOCATION_NAME` (`accounts/XXX/locations/XXX`).
   Setting `GBP_LOCATION_NAME` flips `GBP_CONNECTED` to `true`.
2. Replace the bodies of `fetchReviewsFromGoogle` / `postReplyToGoogle` /
   `deleteReplyFromGoogle` with real GBP v4 calls (TODOs mark each spot).
3. Wire `/gbp/connect` + `/gbp/callback` to the OAuth flow, storing tokens in
   `gbp_credentials`.

**Keep all exported signatures identical** — the API routes and UI call only
these functions, so no other file needs to change.

---

## DA Platform Supabase (read-only)

Review-request segments read **active dealers** from the DA Platform Supabase
(`byouefbebqgffhtfdggu`) via `getDaPlatformSupabase()` in `src/lib/supabase.ts`,
using `DA_PLATFORM_SUPABASE_URL` + `DA_PLATFORM_SUPABASE_SERVICE_KEY`.

- **NEVER written to** — read-only, DA Platform is its source of truth.
- When the env vars are absent, dealer segments are disabled gracefully
  (the preview returns a note); **manual email paste still works**.
- Segments: `active_90_days` (created >90d ago, not already contacted),
  `all_active`, `manual`.

---

## Database

Migration `supabase/migrations/003_reputation.sql` creates: `gbp_credentials`,
`gbp_reviews`, `review_campaigns`, `review_requests`, `private_feedback`, and a
single-row `reputation_settings` (stores the Google review URL).

**Apply it** via the Supabase SQL editor (project `huqohncglbshwuzeguvb`) or
`supabase db push`. Until applied, the dashboard shows an amber "migration not
yet applied" banner and the inbox stays empty.

---

## Cron — review sync

- Endpoint: `POST /api/cron/sync-reviews`, header `x-api-key: $DA_CRON_KEY`.
- Schedule: **EasyCron daily at 08:00 UTC**.
- Works today against mock data; becomes a live Google pull once GBP is connected.
- The dashboard also auto-syncs on first load when `gbp_reviews` is empty.

Example EasyCron command:
```
curl -s -X POST https://<marketing-os-host>/api/cron/sync-reviews \
  -H "x-api-key: $DA_CRON_KEY"
```

---

## Private feedback alerts

Negative-sentiment submissions (`POST /api/reputation/feedback`) are stored in
`private_feedback` and emailed (Resend) to **allan@dealeraddendums.com** and
**alex@dealeraddendums.com** so the team can intervene before it becomes a
public review.

---

## Email

Uses **Resend** (the wired provider in this repo — `RESEND_API_KEY`), not
Mandrill. Campaign emails send from `hello@dealeraddendums.com`; internal alerts
from `noreply@dealeraddendums.com`.
