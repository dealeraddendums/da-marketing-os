# Converted (trial→paid) — marketing-attribution join

> Owner: Allan. Created 2026-06-14. Follow-up to the conversion-funnel wiring (funnel + leads pass).
> Lights up the funnel's last stage **and** lays the foundation for revenue/LTV-by-channel
> (see `seo-sem-northstar.md`). Cross-repo (da-platform + da-marketing-os), billing-adjacent —
> **STOP for review per piece.**
>
> **Prerequisite — SHIPPED + VERIFIED 2026-06-14:** the funnel + leads pass (Engaged/Pricing/Form events
> → `ab_events`; `/api/funnel` counts; live FunnelPanel; `/api/leads-list` + per-row LeadsPanel; PII gate
> on all six admin-data routes). Converted is the only remaining `null` stage.
>
> **C1 — SHIPPED + VERIFIED 2026-06-14** (da-platform `35a0930`, marketing `ffb2b2a`): outbound
> `fireConversionWebhook()` at both upgrade points (join key = the dealer's **`ss_*` text id**, matching
> `marketing_leads.da_dealer_id` — NOT the UUID); migration 007 **applied** (idempotent); inbound
> `/api/conversions` (secret-gated, idempotent, no-backward, unknown-id → 200 no-op); funnel `converted`
> count + live FunnelPanel bar. Env set both boxes. Inbound path exercised via a throwaway lead; outbound
> not yet fired by a real upgrade (deferred — has billing/HubSpot side effects).
>
> **Provisioning gate — RESOLVED 2026-06-14.** Diagnosis verdict: self-serve provisioning is functional
> end-to-end. A controlled call to `/api/self-serve/signup` (the exact call `provisionInDaPlatform` makes)
> returned 201, created a real Trial dealer (`ss_1781454586434`), returned the `dealer_id` that
> `/api/leads` stores as `da_dealer_id`, and fired the HubSpot company (all cleaned up). Marketing-box env
> (`DA_PLATFORM_URL`, `SELF_SERVE_API_KEY`) is set, so `/api/leads` awaits provisioning and stamps the ids
> on **new** signups. The 15 null leads are **stale** (pre-wiring 06-03, repeat test submits, or chat-route
> upserts) — not a code defect. **One link still unproven:** the full browser → `/api/leads` → provision
> chain (CC couldn't headless-test it — `/api/leads` is Turnstile-gated). Now that Turnstile works, **one
> real browser signup** is the final end-to-end confirmation (also the OTP first-login checklist item).
>
> **Chat leads — RESOLVED by decision (Allan, 2026-06-14):** marketing-site chat **never creates a dealer/
> trial** — an unauthenticated chat is purely a **sales lead**. So chat leads intentionally have no
> `da_dealer_id` and are correctly excluded from convert-match + the C2 reconcile. Separately, the chat
> capture was **silently broken** (upsert `onConflict:'email'` with no unique email index → throws →
> swallowed → zero chat leads saved); being fixed to safe insert-if-absent that captures name+dealership,
> never clobbers an existing lead, and never provisions. See the chat-lead-capture fix.
>
> **C2 — CLEARED to build 2026-06-14.** Backfill is a no-op on current data (the 15 have no `da_dealer_id`);
> C2's value is forward reliability. Fold in the `is_test`/`sales_demo` guard on `fireConversionWebhook()`
> (match `fireDealerReliable`'s exclusion) so test-dealer upgrades don't pollute conversion data. **C3 — queued.**

## What this measures
**Marketing-attributed** trial→paid conversions: a lead that came through the marketing site → became a
Trial dealer in DA Platform → started paying. This is the SEM-optimization slice (sliced later by
campaign / keyword / `context_key` / `variation_id`), distinct from the platform-wide BI conversion
report (which counts all dealers incl. legacy-migrated).

## Source of truth — DA Platform, not da-billing directly
DA Platform already owns the conversion event and reconciles billing state. Both upgrade paths already
set `account_type` to paid **and stamp `converted_at`** and fire a HubSpot sync:
- **Dealer self-upgrade:** `da-platform/app/api/billing/me/subscription/route.ts:~251-254`
  (`converted_at` set; `fireDealerReliable(dealer.id, "trial→paid conversion (lifecycle)")`).
- **Operator upgrade:** `da-platform/app/api/dealers/[id]/route.ts:~288-295,430`
  (`lifecycleTransition="upgrade"`; `converted_at` set; `fireDealerReliable(dealerUuid, ctx)`).

So `converted_at` already exists on the DA Platform dealer. **Do NOT read da-billing directly from
marketing.** MRR (optional, for revenue attribution) is read **through DA Platform**, which already has
the billing-status link — respects "Billing alone sets prices" (this is read-only analytics).

## Join key
`marketing_leads.da_dealer_id` (ss_* dealer id, single) / `marketing_leads.da_group_id` (group UUID),
both stored at provisioning time (migration 005). Match the DA Platform conversion to the lead on these.

## Architecture — push + reconcile (belt and suspenders)
1. **Real-time push (primary).** At each conversion point above, fire-and-forget a webhook to marketing
   (mirrors the existing da-billing→da-platform `billing-cache/invalidate` pattern). Marketing stamps the
   matching lead `status='converted'`, `converted_at`, and optional `plan`/`mrr`.
2. **Daily reconcile + initial backfill (safety net).** Marketing cron pulls every lead that has a
   `da_dealer_id`/`da_group_id` and `status != 'converted'`, asks a DA Platform batch endpoint whether
   each is paid (+ `converted_at`, plan, mrr), and stamps the converted ones. Catches any missed webhook
   and backfills leads that already converted before this shipped.

## Schema — marketing migration `007` (Supabase `huqohncglbshwuzeguvb`, SQL editor)
`status` already exists (default `'new'`; reuse the `converted` value). Add:
```sql
alter table marketing_leads add column if not exists converted_at timestamptz; -- from DA Platform
alter table marketing_leads add column if not exists plan         text;        -- plan tier at conversion (optional)
alter table marketing_leads add column if not exists mrr          numeric;     -- monthly value, read-only from da-billing via DA Platform (optional)
create index if not exists marketing_leads_converted_idx on marketing_leads (converted_at);
```

## Endpoints / files

**DA Platform (executes + deploys here):**
- **Outbound webhook** at the two conversion points → `POST {MARKETING_WEBHOOK_URL}/api/conversions`,
  header `X-Webhook-Secret: MARKETING_WEBHOOK_SECRET`, body
  `{ dealerId, groupId?, convertedAt, plan?, mrr? }`. Fire-and-forget (never block/break the upgrade),
  placed next to the existing `fireDealerReliable(...)` calls. New env: `MARKETING_WEBHOOK_URL`,
  `MARKETING_WEBHOOK_SECRET`.
- **Batch status endpoint** `POST /api/stats/conversion-status` (co-located with `stats/active-dealers`,
  same `X-API-Key === SELF_SERVE_API_KEY` gate): body `{ dealerIds: string[], groupIds: string[] }` →
  `{ [id]: { paid: boolean, convertedAt: string|null, plan?: string, mrr?: number } }`. `paid` =
  account_type is the paying tier; `convertedAt` from the dealer row; mrr best-effort via the billing link.

**Marketing OS (executes + deploys here):**
- **Inbound webhook** `POST /api/conversions` — verify `X-Webhook-Secret === MARKETING_WEBHOOK_SECRET`
  (else 401). Match lead by `da_dealer_id = dealerId` OR `da_group_id = groupId`. **Idempotent + no
  backward:** only set when not already `converted`; set `status='converted'`, `converted_at`, `plan`,
  `mrr`. Unknown id → 200 no-op (lead may predate provisioning).
- **Reconcile cron** `GET /api/cron/reconcile-conversions` — auth `x-api-key === DA_CRON_KEY` (mirror
  `cron/sync-reviews`). Select leads with a `da_*` id and `status != 'converted'`, call
  `/api/stats/conversion-status` (`X-API-Key: SELF_SERVE_API_KEY`), stamp the paid ones. Register on
  EasyCron (daily, after the platform's 08:00 sync).
- **Funnel** `src/app/api/funnel/route.ts` — `converted` = count of `marketing_leads` where
  `status='converted'` and `converted_at >= 30d ago`; return the number (no longer `null`).
- **FunnelPanel** (`marketing-dashboard.jsx`) — flip Converted to `tracked:true` (value + `pct(visitors)`),
  drop the "tracked in da-billing" note, add the lag note below.

## The one judgment call — window semantics (DECIDED, Allan can override)
Trial→paid **lags signup by up to the 30-day trial**, so a strict same-cohort 30-day funnel reads ~0 for
the first month. **Decision: headline Converted = conversions whose `converted_at` is in the last 30 days**
(a rolling "we converted N trials to paid" figure), `pct` vs visitors = end-to-end visitor→paid rate. Add
a one-line note: "Trial→paid lags signup by up to the trial length, so this is a rolling count, not a
same-cohort rate." True cohort + LTV-by-channel analysis comes from the persisted `converted_at` +
`context_key`/`variation_id`/`mrr` in the BI/north-star track — not this widget.

## Security / safety
- Inbound `/api/conversions`: secret-verified; idempotent; no-backward (mirror HubSpot lifecycle guard).
- Batch endpoint: `SELF_SERVE_API_KEY` gated. Cron: `DA_CRON_KEY` gated.
- Webhook is fire-and-forget — a marketing outage must never break a dealer's upgrade.
- Read-only w.r.t. billing. Never write to da-billing or Aurora.

## Build phases
- **C1** — schema 007 + inbound `/api/conversions` + funnel/panel flip + the DA Platform outbound webhook
  at both conversion points. (Core: real-time conversions show up.)
- **C2** — batch `/api/stats/conversion-status` + reconcile cron + initial backfill. (Reliability + backfill.)
- **C3** — `plan`/`mrr` enrichment wired through for revenue-by-channel (feeds `seo-sem-northstar.md`).
