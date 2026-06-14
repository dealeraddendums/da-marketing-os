# Marketing OS — pre-cutover + pre-decommission checklist

> Owner: Allan. Created 2026-06-02. Sequencing to move `dealeraddendums.com` off
> HubSpot hosting onto the new us-west-1 box (`54.176.9.39`) and decommission
> HubSpot **website hosting** — **NOT** the HubSpot CRM. Status: ✅ done · ⏳ pending.
> Owner in [brackets]: Allan / CC (Claude Code) / Planning (claude.ai).

## ✅ Done
- New box stood up us-west-1 (`54.176.9.39`, `i-0965cc6c6fa4e8b5f`): packages, build, PM2, Nginx.
- GTM `GTM-KMPMT33Q` installed + verified (the `signup_completed` trigger fires GA4 + the Ads conversion).
- `www1.dealeraddendums.com` A record live, serving the new site (HTTP).
- **Attribution + Signup→DA Platform deployed** — da-platform `c2fedf3` + marketing-os `ca40bed`; `SELF_SERVE_API_KEY` matched both boxes; Turnstile enforced (tokenless → 403); migrations `005` (marketing) + `087` (da-platform) applied. Smoke tests green. **Browser E2E still pending.**

## 1. Finish the build + secure the preview
- [ ] 🔴 **[CC] BLOCKER — scanner-proof OTP onboarding** (`da-platform/docs/scanner-proof-otp-onboarding.md`): replace the consumable magic link with a typed 6-digit `email_otp` code + a `/onboard` code-entry page → passkey setup. Dealer email security (Barracuda) pre-consumes magic links → `otp_expired`. Fixes self-serve **and** migrated-dealer onboarding. + [Allan] Supabase **Site URL → `https://app.dealeraddendums.com`**. **Blocks the Phase-2 browser E2E and real dealer onboarding.**
- [x] [CC] **HTTPS on www1:** Nginx `www1` block → `:3020` + `certbot --nginx -d www1.dealeraddendums.com` + `X-Robots-Tag: noindex`. *(cert valid, exp 2026-09-01.)*
- [ ] [Allan/CC] Apply **migration `004_lead_attribution`** in Supabase `huqohncglbshwuzeguvb` (before any form test).
- [ ] [CC] Confirm the **attribution** build is live (GTM ✅; verify the `da_attribution` cookie + dataLayer push + `marketing_leads` persists the 8 fields). `marketing-attribution.md`.
- [ ] [Allan] Create **Keystatic Cloud (Pro)** team/project on the repo + invite Allan/Alex/Marlena/Claire → give CC the `[TEAM]/[PROJECT]`. [CC] set `storage: { kind: 'cloud' }` + deploy. `keystatic-cloud.md`.
- [ ] [Allan] **Turnstile** widget → site + secret keys; add `www1` (+ later `www`/apex, `localhost`) to allowed hostnames.
- [ ] [Allan/CC] Generate **`SELF_SERVE_API_KEY`** and set it on both boxes' `.env.production`.
- [ ] [CC] Build **signup → DA Platform (dealers + groups)** — the two-repo spec (DA Platform self-serve endpoint + Turnstile verify + HubSpot handoff). `self-serve-signup-provisioning.md`.
- [ ] [Allan, optional] **Search Console** verify (Route 53 TXT — Planning supplies) for organic query data.
- [ ] [Allan/Alex] Any **website content/design edits** (via Keystatic once Cloud is live, or code).

## 2. Test on `https://www1.dealeraddendums.com` (production-like, before cutover)
- [ ] **Attribution:** visit with `?utm_source=…&gclid=…` → submit → `marketing_leads` row has the 8 fields; GTM Preview shows `signup_completed` firing GA4 + Ads.
- [ ] **Signup → DA Platform** *(needs the OTP-onboarding fix shipped first — Phase 1 blocker)*: single + group test → Trial dealer/group in **prod** DA Platform + HubSpot `Dealer Trial` + passkey invite; duplicate email handled; Turnstile blocks a bad submit. ⚠️ **Delete the test Trial dealers / HubSpot companies afterward** (no staging — these are real).
- [ ] **Keystatic Cloud:** `/keystatic` loads + the team can edit; a blog edit commits to the repo.
- [ ] **General QA:** home + personalization, A/B variants, blog, reputation, pricing, all links.

## 3. Pre-decommission prep (so HubSpot hosting can be killed cleanly)
- [ ] [CC] **Migrate marketing images off the HubSpot CDN** (`www.dealeraddendums.com/hubfs/…`) → box `/public`, S3, or Keystatic Cloud Images; update references. *Else images 404 when HubSpot hosting is cancelled.*
- [ ] [CC] Sweep for any other **HubSpot-hosted assets/links/embeds** the new site references → replace.
- [ ] ⚠️ [Allan] **Scope "decommission HubSpot" carefully — CMS/hosting only.** The HubSpot **CRM** (portal `23896347`) and the **onboarding/lifecycle workflows** STAY: DA Platform's Phase 14 sync feeds them and the Phase-5 onboarding workflow fires there. Confirm which HubSpot subscription tier the CRM + workflows need so cancelling the **website/Marketing hosting** doesn't disable them.

## 4. DNS cutover (go live) — ✅ COMPLETE + VERIFIED 2026-06-12

> **✅ DONE 2026-06-12.** Changed **`www` → A `54.176.9.39`** (apex left on the ELB). Let's Encrypt cert
> issued for `www.dealeraddendums.com` (ECDSA, exp 2026-09-10); **HTTP→HTTPS 301** live; **HSTS** active
> over valid TLS; certbot auto-renew confirmed. Externally verified: `https://www.dealeraddendums.com` =
> new Marketing OS site; `dealeraddendums.com/app/login` = Platform 4.0, untouched. (Cert was time-gated
> behind LE's negative-DNS cache; landed 23:46 UTC on the scheduled retry.)
>
> **Post-cutover punch-list (OPEN):** 🔴 **Turnstile** — add `www`/apex to the widget's allowed hostnames
> (signup is BLOCKED until then); **mobile responsive** (sections don't stack — CC prompt issued);
> **PostHog browser smoke**; **migrate gallery images off `/hubfs`** (hero is self-hosted, but the
> "See What Your Addendums Will Look Like" img_1–4 still hot-link the HubSpot CDN → they'll 404 when
> HubSpot hosting is cancelled; see §3); decide whether to **retire `www1`**; **keep HubSpot hosting up**
> as the rollback net until the above clear.

### Plan as executed (topology verified 2026-06-13)
> **Topology (from Route 53):** apex **`dealeraddendums.com` A → AWS ELB** (`newdaloadbalancer`,
> us-east-1) — serves **`/app`** (legacy Platform 4.0, ~1,600 dealers) and redirects `/` → `www`.
> **`www` CNAME → HubSpot** (`23896347.group47.sites.hubspot.net`) — the marketing homepage.
> **`www1` A → `54.176.9.39`** — the new Marketing OS. Marketing and `/app` are on **separate records**,
> so the cutover changes **`www` ONLY**; the apex (and `/app`) is never touched. TTL on `www` is already
> **300** (5-min propagate + 5-min rollback).
- [x] [CC] **`www.dealeraddendums.com`** on the new box's Nginx `server_name` + **TLS cert issued.** Done
  2026-06-12: www was flipped to A `54.176.9.39` first, so HTTP-01 validated directly (no DNS-01 needed).
  Cert ECDSA, exp 2026-09-10; HTTP→HTTPS 301 + HSTS live; certbot auto-renew confirmed. Apex untouched (ELB).
- [x] [CC] **Login chooser shipped** (`00d56e8`) — "Choose your platform": 4.0
  (`dealeraddendums.com/app/login`) + 5.0 (`app.dealeraddendums.com`), across all navs + LayoutA. Every
  "Log in" affordance opens the chooser — **incl. the hero "Log into your account" link** (was pointing
  straight to 5.0; route it through the chooser so existing 4.0 dealers don't land on the wrong platform).
  The **post-signup "Log in here"** stays direct-to-5.0 (a fresh signup is a 5.0 account).
- [ ] [Allan, Sun] **Route 53 — change `www` ONLY:** `www.dealeraddendums.com` CNAME (→ `…sites.hubspot.net`)
  ⇒ A `54.176.9.39` (or CNAME → `www1.dealeraddendums.com`). **Leave the apex `dealeraddendums.com`
  A → ELB exactly as-is** — that's what keeps `/app` + the `/→www` redirect alive.
- [ ] [Allan] Add `www` to Turnstile allowed hostnames (+ GTM/GA4 if hostname-restricted).
- [ ] [Verify, in order] (1) `https://www.dealeraddendums.com` → new site + valid HTTPS; (2)
  `https://dealeraddendums.com/` → redirects to www → new site; (3) **`https://dealeraddendums.com/app/login`
  → Platform 4.0, unchanged** (the critical check); (4) one real end-to-end signup.
- [ ] **Rollback (5 min):** change `www` back to the HubSpot CNAME. Keep HubSpot hosting + the legacy ELB
  alive until the new site is proven (do NOT cancel HubSpot this weekend).
- [ ] [Allan, optional — SEO] If any HubSpot page URLs change on the new site (esp. blog slugs), add
  301s old→new so rankings/backlinks carry over. (Canonical stays `www` — unchanged.)

## 5. Post-cutover + decommission
- [ ] Watch `pm2 logs da-marketing` + GA4/HubSpot for a day or two — confirm stable.
- [ ] [Allan] Remove the legacy GTM **`ajaxComplete`** trigger (only the old HubSpot form needed it).
- [ ] [Allan] Cancel HubSpot **website/CMS hosting** (the ~$400→~$76 saving) — **keep the CRM portal `23896347`**.
- [ ] [Allan] Decommission any old/east marketing EC2 if one existed.
- [ ] **Rollback:** until HubSpot hosting is cancelled, you can repoint DNS back to HubSpot if anything breaks post-cutover.

## Planning closeout (after cutover)
- [ ] [Planning] Pin final host/URLs in `CLAUDE-da-marketing-os.md`; mark **Marketing OS Phase 5** + **DA Platform Phase 13** shipped; note HubSpot is **CRM-only** going forward.
