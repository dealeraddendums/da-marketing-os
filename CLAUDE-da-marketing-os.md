# CLAUDE.md — DA Marketing OS
> See `../CLAUDE.md` for shared infrastructure, design system, team, and architectural rules.
> This file covers da-marketing-os specific context only.

---

## 🔴 ALL ACTIONS PRE-APPROVED — EXECUTE AUTONOMOUSLY

---

## Identity

**Repo:** `github.com/dealeraddendums/da-marketing-os`
**EC2:** Same infrastructure as other DA services
**PM2 app:** `da-marketing` (port 3020)
**Supabase:** `https://huqohncglbshwuzeguvb.supabase.co`
**Deploy:** `git pull && npm run build && pm2 restart da-marketing`

## Purpose

Self-hosted marketing platform replacing HubSpot (~$400+/mo → ~$76/mo).
Handles UTM personalization, A/B testing, AI blog generation, social automation, and analytics.

## Stack

- Next.js 14
- Supabase
- Keystatic CMS (content managed by Marlena/Claire)
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
