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
**App path:** `/home/ubuntu/da-marketing-os` — stood up 2026-06-02 (runbook steps 2–5: packages, build, PM2, Nginx). **TLS + DNS cutover + cron re-point still pending.**
**PM2 app:** `da-marketing` (port 3020)
**Supabase:** `https://huqohncglbshwuzeguvb.supabase.co`
**Deploy:** `git pull && npm run build && pm2 restart da-marketing`

## Purpose

Self-hosted marketing platform replacing HubSpot (~$400+/mo → ~$76/mo).
Handles UTM personalization, A/B testing, AI blog generation, social automation, and analytics.

## Stack

- Next.js 14
- Supabase
- Keystatic CMS — **Keystatic Cloud (Pro)** in prod (seamless team auth, no GitHub accounts for editors; see `docs/keystatic-cloud.md`). All editors (Marlena, Claire, Alex, Allan) can edit all collections; home-page/Landing-Pages edits are by team policy (Allan's OK), not a technical gate.
- HubSpot API (portal ID: `23896347`, private app token `pat-na1-` prefix)
- PM2 + EC2

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
| 5 | Trial Provisioning | 🔵 In progress | Provisioning pipeline fully built (2026-06-28); HubSpot onboarding workflow still needed — see note below |
| 6 | Reputation Manager | ✅ Done | GBP review inbox + AI replies + request campaigns + private feedback. GBP API **stubbed** (mock data) pending Google approval. See `docs/reputation.md` |

## Phase 5 — Trial Provisioning (2026-06-28 update)

**Provisioning pipeline: COMPLETE.** The full end-to-end trial creation flow is live:
- `POST /api/leads` (marketing OS) — Cloudflare Turnstile bot protection, saves to `marketing_leads`, calls da-platform server-to-server, AI enrichment, internal Mandrill notification
- `POST /api/self-serve/signup` (da-platform) — creates Trial dealer/group in Supabase (`account_type='Trial'`, `dealer_id='ss_{timestamp}'`), fires HubSpot reliable-create (`lifecyclestage=Dealer Trial`), seeds sample data, sends passkey invite email. Guarded by shared `SELF_SERVE_API_KEY`.
- `selfServeDuplicateExists()` — checks `profiles` by email before creating; existing legacy dealers get `existing: true` and are directed to `app.dealeraddendums.com`
- **LoginMenu.tsx** (`9cac369`): "Start your free trial" → `/#signup` (always routes to homepage form, works from blog/LP pages); "Existing customers" → `dealeraddendums.com/app/login`
- **V5.0 dashboard migration gate** (`eac7ed8`): unmigrated legacy dealers who reach V5.0 login are blocked at the dashboard layout and redirected to `/not-migrated` (standalone page with legacy login link + migration request email). Passes: `migration_status='migrated'` OR `dealer_id` starts with `ss_`. `super_admin`/`group_admin`/`group_user` bypass.

**Still needed to complete Phase 5 — HubSpot onboarding workflow:** when HubSpot receives a new `lifecyclestage=Dealer Trial` Company (fired on every signup by the reliable-create), trigger an automated email onboarding sequence in HubSpot. This is the one remaining Phase 5 deliverable. Build on Allan's go-ahead.

**Remaining blockers before full marketing relaunch:** `DA_PLATFORM_URL` + `SELF_SERVE_API_KEY` env vars set in marketing OS `.env.production`; `TURNSTILE_SECRET_KEY` configured; TLS cert + DNS cutover for `dealeraddendums.com` → marketing OS server (54.176.9.39).

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
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GBP_LOCATION_NAME                  # set to accounts/XXX/locations/XXX to go live
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
