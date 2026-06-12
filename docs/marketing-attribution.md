# Feature — Google traffic attribution (where signups come from + what they searched)

> For Claude Code. Owner: Allan. Created 2026-06-02. First of the pre-cutover
> marketing workstreams. Goal: know the acquisition source of every signup and
> (where Google allows) the search term, and persist it on each lead.

## Current state
- **PostHog** is wired (client `PostHogProvider` in `app/layout.tsx`; server
  `lib/analytics.ts`) — auto-captures UTM + referrer client-side. `middleware.ts`
  already parses UTMs into request headers (`x-utm-term`, `x-utm-campaign`) for
  personalization.
- **No GA4 / Google Ads tag. No Search Console.**
- **Signup stores no attribution.** `api/leads/route.ts` inserts only
  name/email/dealership/phone/source/ai_enrichment into `marketing_leads`. Two
  forms POST there: `components/marketing/LayoutA.tsx` (~135) and
  `components/marketing/CTASection.tsx` (~29).

## Part 1 — capture attribution on every signup
1. **Edge capture (`middleware.ts`):** on first visit, if no `da_attribution`
   cookie, set one (JSON, ~90-day) with **first-touch**: `utm_source/medium/
   campaign/term/content`, `gclid`, `referrer` (from the `referer` header),
   `landing_page` (path). middleware already reads UTMs — extend it. (First-touch;
   optionally also keep a last-touch set.)
2. **Forms pass it:** add a small `getAttribution()` helper (reads the
   `da_attribution` cookie) and include it in the POST body from **both** LayoutA
   and CTASection.
3. **Server persists it (`api/leads/route.ts`):** write `utm_*`, `gclid`,
   `referrer`, `landing_page` on the `marketing_leads` insert; fall back to reading
   the cookie/headers server-side if the client didn't send them.
4. **Migration** (marketing-OS Supabase; next # — `001_personalization` +
   `003_reputation` exist, so `004_lead_attribution.sql`): `ALTER TABLE
   marketing_leads ADD` `utm_source, utm_medium, utm_campaign, utm_term,
   utm_content, gclid, referrer, landing_page` (all `text`, nullable).

## Part 2 — Google tags via GTM (`app/layout.tsx`)
Allan already runs **Google Tag Manager** (container "Dealer Addendums Website"),
with the Google tag (GA4) + a Google Ads Conversion Tracking tag (**AW-832693330**,
label **CDZFCPi5rNYbENLIh40D**) configured inside it. So install **GTM**, not
hand-coded gtag — GA4 + Ads stay managed in GTM.
- Add the **GTM container** snippet to `app/layout.tsx` (head `<script>` + body
  `<noscript>`), gated on `NEXT_PUBLIC_GTM_ID` (= **`GTM-KMPMT33Q`**). Do NOT
  hardcode GA4/Ads gtag.
- On a successful signup (only after `res.ok`), push a dataLayer event in both
  forms' success handlers: `window.dataLayer.push({ event: 'signup_completed', ...attribution })`.
- **In GTM — add a NEW trigger.** The existing "Sign Up Form Submission" trigger is
  a Custom Event **`ajaxComplete`** gated on legacy AJAX-response DLVs
  (status=success, message=ok) — that's wired for the **old HubSpot form**; the
  React site won't emit it. Add a **new Custom Event trigger `signup_completed`**
  (no extra conditions — the site only pushes it on success) and attach **both**
  existing tags to it (alongside their current trigger): "AW Sign-up Form
  Submission" (`AW-832693330` / `CDZFCPi5rNYbENLIh40D`) and "GA4 Sign Up Form
  Submission" (GA4 `G-NB7NWLQG5D`, event `signup_completed`). Remove the legacy
  `ajaxComplete` trigger after DNS cutover. The app needs no GA4/Ads IDs — only the
  GTM container ID.
- Keep PostHog; optionally add attribution to the server-side signup event.

## Part 3 — Search Console (organic, aggregate)
- Verify `dealeraddendums.com` in Search Console (DNS TXT in **Route 53**, or via
  the GA4 link) and link GA4 ↔ Search Console for organic query reports.

## "What they searched for" — honest scope
- **Paid:** captured via `utm_term` (if campaigns set it) + `gclid` → resolve the
  exact keyword in Google Ads (or offline-conversion import once the dealer exists).
- **Organic:** Google does **not** pass per-user search terms ("(not provided)").
  Search Console gives **aggregate** queries only — never tied to one signup.

## Inputs needed from Allan
- ✅ **GTM container ID: `GTM-KMPMT33Q`** ("Dealer Addendums Website"). GA4 + the
  Ads conversion (`AW-832693330` / label `CDZFCPi5rNYbENLIh40D`) live inside it.
  → `NEXT_PUBLIC_GTM_ID=GTM-KMPMT33Q` in `.env.production`.
- Search Console verification (I'll give the exact Route 53 TXT record) — for
  organic query aggregates.

## Carry-forward
- When the signup → DA Platform provisioning ships (next workstream, dealers +
  groups), pass this attribution onto the created dealer + HubSpot so the
  acquisition source lives on the dealer record.

## Verify
- Visit `?utm_source=google&utm_medium=cpc&utm_term=dealer+addendum&gclid=test123`
  → sign up → the `marketing_leads` row has all `utm_*` + `gclid` + `referrer` +
  `landing_page`; GA4 shows `signup_completed` + the Ads conversion fires; PostHog has it.
- Direct visit (no params) → captures referrer + landing page; utm/gclid null.
- Stop for review before deploy.
