# CLAUDE.md — DA Marketing OS
> See `../CLAUDE.md` for shared infrastructure, design system, team, and architectural rules.
> This file covers da-marketing-os specific context only.

---

## 🔴 ALL ACTIONS PRE-APPROVED — EXECUTE AUTONOMOUSLY

---

## Identity

**Repo:** `github.com/dealeraddendums/da-marketing-os`
**EC2:** `i-0965cc6c6fa4e8b5f` · **us-west-1** · Ubuntu 26.04 · EIP **54.176.9.39** (`eipalloc-0737a00723eefd707`) · SG `sg-01a790aeb9459684e` ("HomePageServer")
**SSH:** `ssh -i ~/ssh/DAHomePage.pem ubuntu@ec2-54-176-9-39.us-west-1.compute.amazonaws.com`

> ⚠️ **There are two boxes, and only this one is live.** `www.dealeraddendums.com`
> resolves to **54.176.9.39** (us-west-1, key `DAHomePage.pem`) — that is the box to
> deploy to, and the one the OAuth redirect URI points at.
> **`18.212.227.125`** (us-east-1, key `~/ssh/DA2026.pem`, the "New Homepage Server" in
> the suite CLAUDE.md) is a **stale June copy**: HEAD `a6d2885`, no `.env.production`,
> none of the Google work. It still answers on :3020, so it looks plausible if you land
> on it by accident. Confirmed 2026-09-11. Don't deploy there.

**App path:** `/home/ubuntu/da-marketing-os` — stood up 2026-06-02 (runbook steps 2–5: packages, build, PM2, Nginx). **TLS + DNS cutover + cron re-point still pending.**
**PM2 app:** `da-marketing` (port 3020)
**Supabase:** `https://huqohncglbshwuzeguvb.supabase.co`
**Deploy:** `bash deploy.sh` **on the box** (hardened: backs up the live `.next`,
aborts + restores on a failed build, health-gates the pm2 restart and rolls back if
:3020 doesn't return 200). A bare `git pull && npm run build && pm2 restart` is NOT
equivalent — `next build` wipes `.next` up front, so a failed build plus a blind
restart crash-loops the site (502 on 2026-06-14).

## Purpose

Self-hosted marketing platform replacing HubSpot (~$400+/mo → ~$76/mo).
Handles UTM personalization, A/B testing, AI blog generation, social automation, and analytics.

## Stack

- Next.js 14
- Supabase
- Keystatic CMS — **Keystatic Cloud (Pro)** in prod (seamless team auth, no GitHub accounts for editors; see `docs/keystatic-cloud.md`). All editors (Marlena, Claire, Alex, Allan) can edit all collections; home-page/Landing-Pages edits are by team policy (Allan's OK), not a technical gate.
- HubSpot API (portal ID: `23896347`, private app token `pat-na1-` prefix)
- PM2 + EC2

## Supabase schema (project `huqohncglbshwuzeguvb`)

`supabase/migrations/001…011` is the complete, authoritative schema — verified
2026-09-08 by applying the whole chain to a scratch PostgreSQL 16 database and
diffing columns, indexes, constraints, triggers, functions, sequences, views and
RLS against the live project: 280 objects, zero differences. Applied by hand in
the SQL editor (or via the Management API — see the memory note on DDL access);
there is no migration-tracking table, so **file presence never proves applied**
— verify by object existence.

**RLS is on for all 16 tables with zero policies** (default-deny). Every reader
is a server-side route using the service-role key, which bypasses RLS; the
`supabaseAnon` client in `src/lib/supabase.ts` is exported but has no consumers.
Adding a permissive policy would expose the table to the anon key that ships in
the public site's JavaScript — don't, unless that is explicitly the goal.

⚠️ **`self_serve_signups` is NOT a table in this project.** It belongs to
**da-platform** (its migration 154, project `byouefbebqgffhtfdggu`) and backs
the per-IP signup rate limit in `da-platform/lib/signup-guard.ts`. The
2026-09-03 signup hardening spanned both repos, which makes this easy to
misread: the marketing side owns the lead row and the confirmation flow
(`marketing_leads`, migration 010), the platform side owns provisioning and
rate limiting. Do not create `self_serve_signups` here.

## Team

- **Marlena** — content editing via Keystatic, deploys via `git pull && npm run build && pm2 restart da-marketing`
- **Claire** — social queue review, lead follow-up

## Phase Status

| Phase | Name | Status | Notes |
|---|---|---|---|
| 1 | Core Site + UTM | ✅ Done | Marketing site, UTM personalization engine |
| 2 | A/B Testing | ✅ Done | A/B testing engine |
| 3 | AI Blog + Chat | ✅ Done | AI-generated blog, streaming chat |
| 4 | Social Automation | ✅ Done | Social automation, EC2 deploy |
| 5 | Trial Provisioning | 🚫 Deferred | Blocker cleared (platform live; da-platform Phase 14 in build) — **build only on Allan's instruction**; see note below |
| 6 | Reputation Manager | ✅ Done | GBP review inbox + AI replies + request campaigns + private feedback. GBP API **stubbed** (mock data) pending Google approval. See `docs/reputation.md` |

## ⚠️ Phase 5 Deferred — Important

Phase 5 (HubSpot Company record creation + trial account provisioning) is intentionally deferred.
Building it now would create a double integration with the legacy Aurora platform.
**Do not build Phase 5 without explicit instruction from Allan.**

**Update (2026-05-30):** The original blocker — new DA Platform not live — is resolved (platform is live; da-platform **Phase 14 HubSpot sync** is in build). Phase 5's scope narrows accordingly: **da-platform now creates the HubSpot Company/Contact on Trial signup**, immediately and with `lifecyclestage=Trial` (by design — see `da-platform/docs/hubspot-sync-plan.md` → "Trial creation = immediate + reliable"). So Phase 5 becomes the **onboarding workflow that enrolls off that Trial event — NOT the record creation** (which removes the old double-integration-with-Aurora risk). The trial-create sync is built to fire immediately so this wiring is drop-in. Still build only on Allan's explicit go-ahead.

## HubSpot Integration

- Portal ID: `23896347`
- Dealer/Group record URL: `/record/0-2/{HUBSPOT_COMPANY_ID}`
- Contact URL: `/record/0-1/{HUBSPOT_CONTACT_ID}`
- Token prefix: `pat-na1-`
- `HUBSPOT_COMPANY_ID` is on `dealer_dim` and `dealer_group` in Aurora
- `HUBSPOT_CONTACT_ID` is on users in Aurora

## Environment Variables

Required in `.env.production`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
HUBSPOT_PRIVATE_APP_TOKEN
RESEND_API_KEY                     # email (campaigns + alerts)
DA_CRON_KEY                        # cron auth (x-api-key header)
# Reputation Manager — DA Platform Supabase (READ-ONLY) for dealer segments
DA_PLATFORM_SUPABASE_URL=https://byouefbebqgffhtfdggu.supabase.co
DA_PLATFORM_SUPABASE_SERVICE_KEY
# Reputation Manager — Google Business Profile (STUBBED until Google approves)
# NOTE: these are NOT the Google reporting integration's credentials — that uses
# the GOOGLE_OAUTH_* pair below. Keep them separate.
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GBP_LOCATION_NAME                  # set to accounts/XXX/locations/XXX to go live
# Google reporting (Ads / GA4 / Search Console) — see the Google Integration section
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_TOKEN_ENC_KEY               # AES-256-GCM key for the refresh token; openssl rand -base64 32
GA4_PROPERTY_ID                    # numeric property id, not G-XXXX
GSC_SITE_URL                       # OPTIONAL — sc-domain:dealeraddendums.com
GOOGLE_ADS_CUSTOMER_ID             # OPTIONAL preselect — 2056900150
GOOGLE_ADS_LOGIN_CUSTOMER_ID       # LEAVE EMPTY unless a real accessible MCC
GOOGLE_ADS_DEVELOPER_TOKEN         # DEAD — retired by Google 2026-09-09, read nowhere
```

## Reputation Manager (`/reputation`)

Internal tool for staff to manage DA's **own** Google Business Profile: monitor
reviews, send dealer review-request campaigns, and reply with AI assistance.
Full reference: `docs/reputation.md`.

- **GBP is STUBBED** (mock reviews) — real Google API pending approval. The only
  file to change when approved is `src/lib/gbp.ts` (signatures must stay identical),
  then set `GBP_LOCATION_NAME`. Everything else already works on mock data.
- **Routes:** `/reputation` (dashboard), `/reputation/reviews` (inbox),
  `/reputation/requests` (campaigns), `/reputation/settings`,
  `/reputation/feedback/[requestId]` (**public** negative-feedback form).
  Admin pages are gated by the `da_admin_auth` cookie (path widened to `/`).
- **Migration:** `supabase/migrations/003_reputation.sql` (5 tables +
  `reputation_settings`) — **must be applied** to project `huqohncglbshwuzeguvb`.
- **DA Platform Supabase** (`byouefbebqgffhtfdggu`) is read **read-only** for
  dealer segments — never written to.
- **Cron:** `POST /api/cron/sync-reviews` (`x-api-key: $DA_CRON_KEY`), EasyCron
  daily 08:00 UTC.
- **Email:** Resend (not Mandrill). Private-feedback alerts go to
  allan@ and alex@dealeraddendums.com.

---

## Google Integration (`/admin` → Analytics · Ads · SEO)

One OAuth grant, three read-only reporting surfaces. **There is no service
account anywhere in this integration** — GA4, Google Ads and Search Console all
authenticate as the single OAuth *user* stored in `google_connection`
(migration 009, one row, `singleton` unique index). So "which service account
do I add in Search Console?" has no answer here: the user already owns the
property.

| Thing | Value |
|---|---|
| Table | `google_connection` — **singular**, one row. Not `google_connections`. |
| Env var names | `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` |
| Refresh token | AES-256-GCM at rest, key `GOOGLE_TOKEN_ENC_KEY` (env only, never in the DB) |
| Access token | never persisted — in-memory, ~1 h, refreshed on demand |
| Redirect URI | `https://www.dealeraddendums.com/api/google/oauth/callback` |
| Cloud project | DA Google Ads, number **843950734394** |
| Code | `src/lib/google/{config,oauth,crypto,ads,ga4,gsc,cache,range}.ts`, routes under `src/app/api/google/`, UI in `src/components/marketing-dashboard.jsx` |

⚠️ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (no `_OAUTH_`) are a **different,
currently-unused pair** belonging to the Reputation/GBP module. Keep them
separate so revoking one integration cannot break the other.

### No developer token (changed 2026-09-09)

Google **retired Google Ads developer tokens on 2026-09-09.** Ads calls send
**only** `Authorization: Bearer <token>`, plus `login-customer-id` when an
account is reached through a manager. Verified empirically:
`customers:listAccessibleCustomers` answers **200 with no developer-token
header at all**.

`GOOGLE_ADS_DEVELOPER_TOKEN` is therefore **read nowhere** — it survives in
`.env` and in `googleEnv` only so an old value can't break a build. Nothing
gates on it. If Google ever reverses this, the one-line revert is a
`'developer-token'` entry in `authHeaders()` in `lib/google/ads.ts`; the raw
error-body logging described below would say so explicitly.

### Reconnect for new scopes

The consent screen was widened on 2026-09-11. The request set is now
`openid`, `email`, `adwords`, `webmasters`, `analytics.readonly`,
`business.manage`, `indexing`.

**Adding scopes to the request does not widen an existing grant.** Google
returns only what was consented to at the time, so a connection made before the
screen changed keeps its narrower set forever. Consequences:

- Per-surface readiness badges read the **scopes the stored grant actually
  holds** (`surfaceGranted()`), not env vars.
- When the grant is narrower than the request set, the connect panel shows
  **"Reconnect to grant new permissions"** listing exactly which scopes are
  missing. `needsScopeUpgrade` (healthy but narrow) is deliberately distinct
  from `needsReconnect` (grant is dead).
- The consent URL always uses `access_type=offline` + `prompt=consent`, so a
  reconnect is also how a revoked grant is repaired.
- `missingScopes()` treats `webmasters.readonly` as satisfying `webmasters` —
  an older grant holding the readonly form reads Search Console fine and must
  not be nagged.

**`exchangeCodeAndStore` never overwrites a stored refresh token with null.**
Google only returns a refresh token on first consent or under
`prompt=consent`; if it withholds one and a token is already on file, the
existing ciphertext is **kept** and only scopes/identity are updated. It throws
only when there is no new token *and* nothing stored. (Previously it threw
before the scope update, which would have turned a successful re-consent into a
dead connection.)

**Current grant (2026-09-11):** has `adwords`, `analytics.readonly`,
`webmasters.readonly` → Ads, Analytics and SEO all work with **no reconnect
needed**. Missing `business.manage` and `indexing`, so those two badges read
"not granted" until Allan reconnects. `account_email` is null because the
original grant predates the `openid`/`email` scopes — a reconnect populates it.

### Google Ads

REST base **`https://googleads.googleapis.com/v25`**. Reporting only — there is
no mutate surface in `ads.ts` at all; Ads writes are Phase 2 behind the
`proposed_changes` queue.

Accounts are **discovered, not configured**: `listAccessibleCustomers` →
`customerInfo` per account → `listClientAccounts` to expand any manager one
level. The Ads tab lists them (children indented under their manager) and
clicking one runs a last-30-days `campaignReport`: impressions, clicks, CTR,
avg CPC, cost, conversions, with a totals row. Ratio metrics are recomputed
from account totals — averaging per-campaign CTR would weight a 10-impression
campaign like a 100,000-impression one. A manager is never auto-selected: an
MCC has no campaigns of its own and would render an empty table that looks
like a failure.

`GOOGLE_ADS_CUSTOMER_ID` is now only a **preselect hint**, and
`GOOGLE_ADS_LOGIN_CUSTOMER_ID` should normally be **empty**.

**Three landmines, all of which were live bugs fixed 2026-09-11 (`e4182c5`):**

1. **`pageSize` is rejected in v25.** Sending it is a hard 400:
   `PAGE_SIZE_NOT_SUPPORTED — Search Responses will have fixed page size of
   '10000' rows.` The old client sent `pageSize: 1000` on every call, so every
   query failed even with perfect auth. **Paginate with `pageToken` only.**
2. **A wrong `login-customer-id` breaks everything.** The env held
   `GOOGLE_ADS_LOGIN_CUSTOMER_ID=6947440699`, which this grant cannot access →
   every query returned `USER_PERMISSION_DENIED`, whose message unhelpfully
   *suggests setting a login-customer-id*. Both reachable accounts are
   `manager: false`, so the header must be **omitted**. It is now derived per
   account from the discovered hierarchy instead of trusted from env.
3. **The panel used to gate on the developer token**, so it could never light
   up regardless of what Google approved — it would have shown "awaiting Basic
   Access" forever.

**Accessible accounts** (both non-manager, directly reached):

| Customer ID | Name |
|---|---|
| `2056900150` | Dealer Addendums — the default |
| `6495986391` | The Little Farm on Olga Rd (Allan's other business) |

### Search Console

**A URL-prefix property and a domain property are different objects**, and
asking for one you don't own returns **403 "User does not have sufficient
permission for site …"** — which reads like a permissions problem but is a
wrong-identifier problem. That was the live SEO bug: `GSC_SITE_URL` was
`https://www.dealeraddendums.com` while `sites.list` shows the account owns
exactly one property, **`sc-domain:dealeraddendums.com`** (`siteOwner`).

`GSC_SITE_URL` is now **optional**. `resolveSite()` in `lib/google/gsc.ts`
resolves the property at query time against Google's own `sites.list`:

1. `GSC_SITE_URL` if the account actually has it (`resolvedFrom: "env"`);
2. else its variants — trailing slash added/removed, and the `sc-domain:` form
   of the same host (`resolvedFrom: "variant-of-env"`, logged with the exact
   value to set);
3. else the only usable property, when there is exactly one
   (`resolvedFrom: "only-property"`);
4. else throw, naming every property the account has.

`siteUnverifiedUser` is excluded — it can list a property but not read it. The
box is set to the correct explicit value, and the fallback was verified by
temporarily restoring the wrong one (it resolved via `variant-of-env` and
returned identical data).

### Debugging: the raw error body is the whole game

Both clients now `console.error` the **complete** Google response body on
failure, plus the GAQL query and Google's `requestId`. Google's error JSON is
where the actual cause lives (`errorCode.authorizationError`,
`SERVICE_DISABLED`, `PAGE_SIZE_NOT_SUPPORTED`), and its absence is why both of
these bugs cost a diagnosis instead of a glance.

```
pm2 logs da-marketing --lines 200 --nostream | grep -E 'google-(ads|gsc|oauth)'
```

Responses are read as **text first, then parsed** — Google answers with an HTML
error page when an API is disabled, and `res.json()` on that throws
`Unexpected token '<'`, which used to surface to the operator as a raw parser
error. Failure *states* (API not enabled, permission refused, scope missing)
answer **200 with a readable shape** so the panel renders a calm message; only
genuine faults return 502.

### Verified live 2026-09-11 (30 days to Sep 11)

| Surface | Result |
|---|---|
| Ads — Dealer Addendums | 3,185 impressions · 460 clicks · 14.44% CTR · $7.05 avg CPC · $3,241.72 cost · 15.5 conversions · 12 campaigns |
| Ads — Little Farm | 2,366 impressions · 27 clicks · 1.14% CTR · $0.24 avg CPC · $6.54 cost |
| SEO | 317 clicks · 2,621 impressions · 12.09% CTR · avg position 6.67 · top query "dealer addendum" (120) |
| Analytics (regression check, untouched) | 41,202 sessions · 2,799 users |

### Caching

15-minute in-process cache (`lib/google/cache.ts`), single PM2 fork so one
process is the whole cache. `?refresh=1` forces a re-query; the Refresh button
sends it. The account list is cached under its own key
(`google:ads:accounts`) so switching accounts doesn't re-enumerate.

### No schema change

This work needed **no migration** — `google_connection.scopes` already carries
everything the scope-gap logic needs, and Ads accounts are discovered at
runtime rather than stored. Per the schema-audit notes above, any future change
here goes in a numbered migration file, never the SQL editor.

---

## Analyst (`/admin` → Analyst)

On demand, assemble a marketing snapshot from the three Google integrations,
send it to Claude, and render a structured analyst brief: **findings →
diagnoses → prioritized recommendations**. Read-only in both directions —
nothing here can change a Google account, and the model is never given a write
tool. A recommendation is advice until a human acts on it.

| Thing | Value |
|---|---|
| Table | `analyses` (migration **012**) |
| Model | `claude-sonnet-5`, pinned in `ANALYST_MODEL` (`lib/analyst/analyze.ts`) |
| Key | `ANTHROPIC_API_KEY` (already in `.env.production`) |
| Code | `src/lib/analyst/{snapshot,analyze,store}.ts`, routes under `src/app/api/analyst/`, UI `AnalystPanel` in `src/components/marketing-dashboard.jsx` |
| Cost | ~$0.08 per run at observed sizes (~8.7k in / ~6.7k out); ~60–90 s |

### Why raw `fetch`, not the SDK

`lib/analyst/analyze.ts` calls `https://api.anthropic.com/v1/messages` directly
instead of using `lib/ai.ts`. Two reasons, and both still hold:

1. This project pins `@anthropic-ai/sdk` at **`^0.20.0`** (2024-era), which
   predates the parameters used here (`thinking: {type:'adaptive'}`,
   `output_config.effort`).
2. `lib/ai.ts` is **shared with the live chat widget and the reputation reply
   drafter**, and its `MODEL` is a different, older model. Bumping the SDK or
   that constant to serve the Analyst would move two unrelated live features
   onto new versions.

So the Analyst names its own model constant and owns its own HTTP call. If you
ever do upgrade the SDK, this is the file that can move back — but re-test the
chat widget and reputation drafting when you do.

⚠️ `claude-sonnet-5` **rejects** `budget_tokens` and the sampling parameters
(`temperature`/`top_p`/`top_k`) with a 400. Adaptive thinking is the only
on-mode. Don't "helpfully" add a temperature.

### The snapshot (`lib/analyst/snapshot.ts`)

Built **entirely from the existing Google clients** — no new Google API
surface:

| Source | Function | Content |
|---|---|---|
| Ads | `listAdsAccounts()` + `campaignReport()` | per non-manager account: totals + up to 25 campaigns (impressions, clicks, CTR, avg CPC, cost, conversions) |
| Search Console | `fetchGscSummary()` | top 50 queries, top 25 pages, 30d totals (clicks/impressions/CTR/position) |
| GA4 | `fetchGa4Summary()` | channels, top sources, funnel numbers — **untouched** |

`fetchGscSummary` gained an optional `limits` argument so the snapshot can ask
for 50 queries where the SEO tab asks for 25. **Defaults are unchanged**, so
the SEO tab behaves exactly as before — it is the same `searchAnalytics/query`
endpoint with a different `rowLimit`, not a new call.

Two deliberate choices:

- **Not cached.** It deliberately does not go through `lib/google/cache.ts`: a
  run is manual and infrequent, pressing "Run analysis" means *look at the data
  now*, and sharing the tabs' cache keys with different row limits would let a
  25-row cached entry satisfy a 50-row request.
- **One failing source never fails the run.** A brief about Ads and SEO is
  still worth having when GA4 is down. Failures land in `meta.errors` and are
  passed to the model, so it is *told* what is missing instead of silently
  reasoning over a hole.

Rows are capped and numbers rounded (money to cents, ratios to 4dp) to stay
well under the token target. **`meta.approxTokens` reports the realised size**
and is shown in the UI, so a regression in this file is visible rather than
quietly expensive. Observed: **~2,700 tokens**, against a ~15k target.

### The `measurement` block — the part that earns its keep

A snapshot alone cannot distinguish *"zero happened"* from *"zero recorded"*,
and a brief that reads the first as fact will confidently optimise toward a
metric that isn't wired up. So instrumentation state is **computed** and passed
in explicitly:

- `ga4ConversionsZero` — GA4 reports 0 conversions; no key event is configured.
- `ga4SignupsInstrumented: false` — `funnel.signups` is a **hardcoded 0** in
  `lib/google/ga4.ts`, not a measurement.
- `ga4FormStartInstrumented: false` — no `form_start` event exists, which is
  why the admin funnel greys that step out.
- `adsConversionsZeroAccounts` — any Ads account reporting 0 conversions
  against real paid clicks.
- `gscPropertyIsDomainLevel` — `sc-domain:` spans every subdomain including the
  app, so GSC clicks are not comparable to marketing-site GA4 sessions.

Every flag is **derived from the data actually fetched**, so it stops being
raised the moment the underlying gap is fixed. The system prompt then requires
the brief to establish measurement integrity *before* any campaign advice, and
to raise at least one `critical` finding in area `measurement` whenever a gap
is present. Optimising bids while the conversion signal is broken is the
failure mode this is designed against.

### Brief schema

```
{ summary,
  findings:        [{ severity: critical|warning|opportunity|info,
                      area: ads|seo|analytics|measurement,
                      title, evidence, diagnosis }],
  recommendations: [{ priority, action, rationale,
                      expected_impact, effort: low|med|high, watch_metric }] }
```

`evidence` must cite real numbers from the snapshot. Findings are sorted
critical-first and recommendations by priority in `normalise()`, so the UI never
depends on the model's ordering. Unknown enum values are coerced to safe
defaults rather than crashing a render.

**Parsing is layered**: verbatim → fences stripped → outermost braces. A parsed
object that isn't shaped like a brief counts as a *failure*, not a success —
storing it would render an empty panel with no explanation. A parse failure is
a recorded outcome: `status='parse_error'`, raw text in `raw_response`, shown in
the UI. The full raw response is logged server-side either way:

```
pm2 logs da-marketing --lines 200 --nostream | grep '\[analyst\]'
```

### Routes

| Route | Behaviour |
|---|---|
| `POST /api/analyst/run?days=30` | snapshot → Claude → store → return brief. `maxDuration = 300`. Returns **409** if a run is already in flight. **503** if no Google source is available (rather than paying for a call over an empty object). |
| `GET /api/analyst/latest` | most recent run with its full brief |
| `GET /api/analyst/history?limit=20` | light list (no snapshot/brief) so the payload stays small; `?id=<uuid>` returns that run's full brief for expanding a history row |

All three are gated by `isAdminAuthed()` (`da_admin_auth` cookie).

**Concurrency** is an in-process flag in `lib/analyst/store.ts`. That is a real
lock *while da-marketing runs as a single PM2 fork* — the same assumption
`lib/google/cache.ts` makes. **If this is ever clustered, move it to the
database** (an `in_flight` row or a Postgres advisory lock). A stale flag
self-clears after 5 minutes so a wedged run can't lock the feature out forever.

### Missing-table detection

Until 012 is applied, the routes detect it and say so precisely, and a run
still returns its brief with a banner explaining it couldn't be saved — a
pending migration shouldn't look like a broken feature.

⚠️ supabase-js answers through PostgREST, which reports an unknown relation as
**`PGRST205` — "Could not find the table 'public.analyses' in the schema
cache"**, *not* Postgres's `42P01`. Matching only 42P01 silently missed it on
the first live run. `isMissingTable()` now matches both, by code and by message.

### Adding a data source to the snapshot

The snapshot is the only file to touch. For each new source:

1. Call the **existing** client for it; don't add a Google/HTTP surface here.
2. Wrap it in its own `try/catch` that pushes to `errors` — never let it fail
   the run.
3. Add the trimmed shape to `AnalystSnapshot` and cap the rows.
4. If it can be *absent vs. zero*, add a computed flag and a note to the
   `measurement` block. This is the important step: an uninstrumented source
   that looks like a real zero is worse than no source at all.
5. Re-check `meta.approxTokens` in the UI after the change.

**GBP is the next one**, once Google approves the Business Profile API. The
`business.manage` scope is in the request set but **not yet granted** on the
live connection (it needs a reconnect — see the Google Integration section), and
`src/lib/gbp.ts` is still stubbed on mock data. When it goes live, add review
volume/rating/response-rate to the snapshot and a `gbpIsStubbed` flag to
`measurement` so a brief can never mistake mock reviews for real ones.

### Intended evolution: recommendations → Approvals-gated actions

Today a recommendation is text. Migration 009 already ships the foundation for
turning them into gated writes: `proposed_changes` (typed, with
`before_json`/`after_json`, a `status` lifecycle, and `source` including `'ai'`)
and `change_audit`. The Approvals tab renders that queue and is deliberately
empty.

The path is: the Analyst emits a `proposed_changes` row with `source='ai'`
alongside each actionable recommendation → a human approves or rejects it in
Approvals → an applier executes it against the Google Ads API and writes
`change_audit`.

**The write path does not exist yet, and `lib/google/ads.ts` deliberately
exposes no mutate surface at all** — there is no code path in this repo that
can spend money, which is a property worth keeping until the approval queue is
real. Build the queue and the audit trail before the applier, not after.

---

## Tracking (GA4 · GTM · Google Ads conversions)

### How GA4 is installed

**Through GTM, not gtag.** `src/app/layout.tsx` injects container
**`GTM-KMPMT33Q`** (env-gated on `NEXT_PUBLIC_GTM_ID`, inert when unset) plus
the `<noscript>` iframe. There is no `gtag.js` anywhere in the codebase, so the
GA4 config, the Ads tag and every trigger live **inside the container**, not in
this repo — you cannot see them by reading code. The container is public,
though, which is how the IDs below were found:

```
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-KMPMT33Q" | grep -oE 'G-[A-Z0-9]+|AW-[0-9]+'
```

| Thing | Value |
|---|---|
| GTM container | `GTM-KMPMT33Q` |
| GA4 property | `413858087` (`GA4_PROPERTY_ID`, what the Analytics tab reads) |
| GA4 stream — **Measurement Protocol** | **`G-22M57J2LLS`** ← the api_secret is bound to this |
| GA4 stream — what GTM sends to | `G-NB7NWLQG5D` |
| Google Ads | `AW-832693330` |

⚠️ **Two web data streams, one property.** Both feed `413858087`, so reporting
is unified — but a Measurement Protocol **api_secret is stream-scoped**, and a
mismatched measurement_id/api_secret pair **is not an error**: Google answers
`204` and silently drops the event. That burned a debugging cycle on
2026-09-11 (payloads validated clean, returned 204, nothing arrived). **Never
trust the 204 — confirm in Realtime.**

⚠️ The container still carries **HubSpot-era triggers** from the legacy site:
`hs-form-event:on-submission:success`, a `/thank-you` path, and
`#successModal > div > div > div.modal-body`. None of those exist on the
Next.js site. They are inert but they make the container misleading to read.

### Events

| Event | Where it fires | Transport | Notes |
|---|---|---|---|
| `trial_signup` | `confirmAndProvision()` in `lib/lead-confirm.ts`, at **email confirmation** | Measurement Protocol (server) | The conversion. Sent for `provisioned` / `existing` / `pending_review`; not for `after_hours` / `rejected` |
| `trial_form_start` | `handleFormStart` → `sendFormStartOncePerSession()` → `POST /api/track/form-start` | Measurement Protocol (server) | Once per **session** (sessionStorage) |
| `form_start` | GA4 **enhanced measurement**, automatic | client | **Not ours, and not the trial form** — every form on the site. 57,647 events / 30d vs 41,460 sessions |
| `signup_completed` | `pushSignupEvent()` at **form submit**, pre-confirmation | dataLayer → GTM | Pre-existing. Feeds the Ads conversion. **See the audit below** |

**Why `trial_signup` is server-side.** A signup is only real once the applicant
confirms their email (Layer 0). That click arrives from their **email client** —
a different GA4 session, usually with no referrer. Firing it client-side on
`/confirm/[token]` would attribute every trial to Direct and destroy the one
number this exists to produce: cost per trial by channel. So it is sent from the
server using the GA4 client and session ids captured in the **originating**
session (migration 013 carries them on `marketing_leads`). No PII ever reaches
GA4 — only a truncated SHA-256 of the lead id.

**Why `trial_form_start` and not `form_start`.** GA4 already populates
`form_start` itself via enhanced measurement, for every form on the site.
Sending our own would double-count the trial form *and* bury it in a site-wide
number. A distinct name is queryable by `eventName` immediately, with no
custom-dimension registration.

⚠️ **Do not create GTM GA4 event tags named `trial_signup` or
`trial_form_start`.** GA4 receives them only via `lib/ga4-mp.ts`; a GTM tag as
well would double-count.

**Degradation.** `lib/ga4-mp.ts` is inert without both env vars — every send is
a logged no-op and nothing else breaks. With no `_ga` cookie (consent declined,
blocker, GTM not yet loaded) a synthetic client id stands in so the conversion
is still **counted**, with `attribution_recovered=false` marking it as
unattributable. Counting was the actual complaint; an unattributed conversion
still counts.

### Funnel data sources (`/admin` → Overview → Conversion Funnel)

The panel has a **GA4 / First-party** toggle and the two will never agree — GA4
counts the whole site, first-party `ab_events` fire only on the homepage and
`/lp` pages.

| Step | GA4 toggle | First-party toggle |
|---|---|---|
| Sessions / Visitors | GA4 `sessions` | `ab_events` `hero_impression` |
| Engaged | GA4 `engagedSessions` | `engaged_30s` |
| Pricing | GA4 pageviews matching `pricing` | `pricing_view` |
| **Form Started** | GA4 **`trial_form_start`** | `ab_events` `form_start` |
| **Trial Signup** | GA4 **`trial_signup`** | `marketing_leads` **row count** |
| Converted | `marketing_leads.converted_at` | same |

Two lies were removed here on 2026-09-11:

1. `funnel.signups` was a **literal hardcoded `0`** in `lib/google/ga4.ts`,
   rendering as a measured zero.
2. The analytics route then **overwrote** it with the `marketing_leads` row
   count — so the "GA4" toggle presented a first-party number as if GA4 had
   measured it, *and* counted every lead row (unconfirmed and bot submissions
   included) as a trial signup.

Now: GA4's own counts stand on the GA4 toggle, and the first-party numbers ride
alongside as `firstParty: { leads, confirmedLeads }`, shown in the footnote so
the reconciliation is visible. A genuine 0 renders **"no events yet —
instrumented {date}"** (`EVENTS_INSTRUMENTED_AT` in `lib/google/ga4.ts`),
because GA4 cannot be backfilled and any earlier period legitimately has none.

⬜ **Still overstated, deliberately left alone:** the **first-party** toggle
counts every `marketing_leads` row as a Trial Signup. Under Layer 0 a submitted
form is a *lead*; a confirmed one is a *signup*. Changing that number's meaning
is Allan's call.

### Conversion-action audit (read-only, 2026-09-11)

GA4 reported **0** conversions while Ads reported **15.5** for the 30 days to
2026-09-11. Both were right; they measure different things, and one measures
the wrong moment.

24 conversion actions exist on `2056900150`, nearly all `REMOVED` legacy
(AdWords Express smart goals, `HubSpot - Customer` upload, three
GA4-purchase imports, a `LP Form Submit`). **Two recorded anything:**

| Action | Type / category | In `conversions` metric | 30d |
|---|---|---|---|
| **`AW Sign-up Form Submission`** | `WEBPAGE` / `SIGNUP`, `ONE_PER_CLICK`, 90d click lookback, data-driven attribution | **yes** | **15.50** |
| `Dealer Addendums - GA4 (web) signup_completed` | `GOOGLE_ANALYTICS_4_CUSTOM` / `SIGNUP`, `MANY_PER_CLICK` | **no** | 0 (13 `all_conversions`) |

**What they actually measure: form submission, not a trial signup.**
`lib/attribution.ts → pushSignupEvent()` pushes `signup_completed` into the
dataLayer on a successful `POST /api/leads` — i.e. at form submit, *before*
email confirmation. GTM forwards it to both actions above. So:

- GA4 shows **0** because `signup_completed` is **not marked a key event**;
  GA4's `conversions` metric only counts key events.
- Ads shows **15.5** from its own webpage action, which *is* in the metric.
- The two differ (15.5 vs 13) through attribution model and the 90-day lookback.

**Reconciliation against first-party truth:**

| | 30d (Aug 13 – Sep 11) | Layer-0 era only (Sep 3 – 11) |
|---|---|---|
| Ads `conversions` | 15.50 | 3.00 |
| Ads cost | $3,241.72 | $1,220.25 |
| **Cost per Ads "conversion"** | **$209.14** | $406.75 |
| Leads submitted (all) | 38 | 14 |
| Leads submitted with a `gclid` | **16** | 4 |
| Paid leads **confirmed** | 3 | **3** |

**Read: the $209 is not cost per trial.** It is cost per *form submission*,
and it counts submissions that never confirmed — including the 2026-09-03 bot
signups. The 30-day totals prove what the action measures: **15.5 conversions
against 16 paid form submissions**. Confirmation only becomes measurable on
Sep 3 (Layer 0), so the only honest window gives **$1,220.25 / 3 = $406.75 per
confirmed paid trial — about 1.9× the headline figure**. The paid confirm rate
in that window is 3 of 4 (75%), so the gap is mostly the pre-Layer-0 period
being unmeasurable, not mass abandonment. Treat $209 as a cost-per-lead proxy
that drifts further from truth whenever confirm rate drops.

⬜ **Not changed, on purpose:** `signup_completed` still fires exactly where it
did. The name is wrong (it is a form submit) but the GTM trigger and the live
Ads conversion action depend on it — renaming or moving it would silently change
Ads conversion volume and therefore Smart Bidding. That is a deliberate
decision for Allan, not a side effect. **No Ads mutations were made; the audit
was read-only GAQL.**

### Manual GA4 Admin steps (cannot be done from code)

1. **Mark `trial_signup` a key event** — this is what makes GA4's
   `conversions` metric non-zero: GA4 Admin (gear, bottom-left) → *Data
   display* → **Events** → find `trial_signup` → toggle **Mark as key event**.
   The event must have been received at least once to appear (it has been, see
   below).
2. *(optional)* Import it to Ads as a proper trial conversion, replacing the
   form-submit action: Admin → **Product links** → Google Ads links → the
   `AW-832693330` link → Conversion import.
3. *(optional)* Register `lead_utm_source` / `lead_utm_medium` /
   `lead_is_paid` as **custom dimensions** (Admin → *Data display* → Custom
   definitions) to break signups down by channel in explorations.
4. The **Google Analytics Admin API is disabled** on Cloud project
   `843950734394`, so data streams and key events cannot be read or set
   programmatically. Enable it at
   `console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=843950734394`
   if that is ever wanted.

### Verification, 2026-09-11

Payloads validated against `https://www.google-analytics.com/debug/mp/collect`
(validates without ingesting) — `validationMessages: []` for both, with a
deliberately malformed param confirming the validator was actually checking
(`NAME_INVALID`). Then both events were sent for real with `debug_mode=1` and
`cc_test_event=true`, and **confirmed received in property 413858087's Realtime
report**: `trial_form_start=1`, `trial_signup=1`. The live app endpoint was
exercised too (`POST /api/track/form-start` → 204 →
`[ga4-mp] sent "trial_form_start" status=204 attributed=true`).

**Two test events exist in GA4** from that verification, both carrying
`cc_test_event=true` and `debug_mode=1`; exclude on that param if it matters.

Watch the wiring with:

```
pm2 logs da-marketing --lines 200 --nostream | grep -E '\[ga4-mp\]|\[trial-signup\]'
```
