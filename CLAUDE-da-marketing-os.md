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
