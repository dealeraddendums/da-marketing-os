# Dynamic Landing Engine — architecture + phased plan

> Owner: Allan. Created 2026-06-11. da-marketing-os. A rethink of the static A/B landing pages into a
> **real-time, visitor-tailored, self-optimizing** engine. Planning artifact — Phase 1 is the build
> target; later phases are designed but sequenced. Each phase: **STOP for review before deploy.**

> **STATUS — 2026-06-11: Phase 1 SHIPPED to staging** (`b3c8eea`, https://www1.dealeraddendums.com —
> pre-cutover preview; the public legacy site is untouched). Verified end-to-end: signals + `contextKey`,
> guardrailed generation that **failed closed** in testing (rejected an off-corpus "window stickers"
> headline twice — nothing un-validated rendered), context-cached fast paint, kill-switch, PostHog
> tagging; `marketing_leads` + `ab_events` carry `context_key`/`variation_id` (migration `006`). Prod =
> the DNS cutover (Allan's call). **Follow-ups SHIPPED 2026-06-12** (`4162e99` + `a2db0a4`, staging):
> (1) **brand corpus LOCKED** — `CORPUS_REVIEWED_BY='allan'`, v2026-06-12.1: trial = 30-day/30-vehicle,
> stats rounded (**3.6M+** addendums, **$800M+** value, **1,600+** dealers), live "526 today" + $0.22
> label price removed; the same stale/overstated figures were also swept out of the static site (hero
> cards, testimonials, OG image, metadata, chatbot fact sheet) — corpus values verified in
> `brand-corpus.ts`. (2) **Group-tab explainer** (master-account vs single-store steer; `?signup=group`
> deep-link). (3) **Real DA logos** across nav/footers/favicon (internal staff pages still on the old
> "DA" chip — Allan's call). **Remaining before real traffic:** PostHog browser smoke test on www1, then
> the **DNS cutover**. Open nits: per-label price = "as low as $0.22 each, volume pricing" (22–30¢ by
> qty); a future **live-stat feed** could restore a real-time "printed today" card safely.

> **Corpus revised to v2026-06-12.3** (`e8d1d5b`, staging) — product-messaging update, corpus + static
> site in lockstep: **SMS Lead Capture removed**; **iOS app now included** (no $10 charge);
> **Color-Matched Vehicle Images** = the lone **$50/mo** add-on (deliberately not a free benefit);
> **Magic Button** (VDP PDF addendum) + **Combo Addendum** (Required vs Suggested) added (framed as
> transparent disclosure — no CARS-rule); **any-provider auto-inventory** + **rules-based product
> assignment** (incl. fuel type) strengthened; **"addendums build themselves — virtually eliminates
> manual-entry error"** value prop. Verified in `brand-corpus.ts`; 2 sample generations validator-green.
> Note: the LayoutA legacy-mirror gained Magic Button (replacing SMS) but not separate Combo /
> Color-Matched cards — optional content parity, Allan's call.

## Decisions locked (Allan, 2026-06-11)
- **Copy engine:** fully **real-time per visitor** (generate on the fly, not a frozen library).
- **Autonomy:** **guardrailed auto-publish + audit** (live, no human gate, strict guardrail + log + rollback).
- **Signals:** **full Google Ads API** (live spend/CPA + search-terms), not just URL params.
- **First slice:** **per-visitor personalization** of the hero.

## The vision
The DealerAddendums marketing page stops being one (or two) fixed pages and becomes a **per-visitor,
self-improving page**: it reads who's arriving (the ad keyword that brought them, dealer type, geo,
device, returning-or-not, in-session engagement), generates copy tailored to *that* visitor in real
time, measures whether it converted, and continuously shifts toward what converts best — weighted by
what you're *paying* for those clicks — with Claude authoring and retiring variations in the loop.

## The closed loop
1. **Signal** — capture the visitor's context at arrival + progressively during the visit.
2. **Decide** — for that context, choose the variation most likely to convert (Phase 2+ bandit).
3. **Generate** — Claude writes the tailored hero for the context, inside a hard brand guardrail.
4. **Render** — paint instantly (static-first), swap in the tailored copy; never block the page.
5. **Measure** — every view / engagement / conversion flows back tagged with context + variation.
6. **Learn** — Claude periodically reads the metrics + spend, authors new variations, retires losers.

---

## Four engineering realities baked in (these refine the locked choices — important)

**1. "Real-time" must still be fast → generate per *context*, cached, static-first.**
A landing page can't block on a multi-second Claude call — slow LCP kills both conversions and your
Google Ads Quality Score (raising CPC). So "fully real-time per visitor" is implemented as: a stable
**context key** (matched-keyword cluster + dealer-type + geo bucket + device + new/returning); the
**first** visitor in a context triggers generation and the result is cached (short TTL); identical
contexts are served instantly from cache. Two visitors with the same context get the same bespoke copy
— which is still "tailored to the visitor," just not pointlessly regenerated. The page always paints a
**known-good static hero first** and swaps in the tailored copy when ready (or renders it server-side
from cache). Pure per-individual regeneration is possible but adds cost/latency with no conversion
benefit — not recommended; flagging so the choice is explicit.

**2. Google reality — you get the matched *keyword* live, the raw *query* only in aggregate.**
Google deliberately does **not** expose the exact text a user typed on a per-click basis. What's
available: the **matched keyword** (+ campaign/ad group) live, via a ValueTrack `{keyword}` token you
template into your ad final URLs — zero API, instant. The **real search queries** come from the Ads
API **Search Terms report** (aggregate, slight reporting lag) — perfect for *Claude* to study per ad
group and craft sharper variations, but not a per-visitor signal. **Spend / cost-per-conversion** per
keyword also comes from the Ads API (near-real-time-ish). So "based on live Google search terms" =
**matched-keyword live, per-visitor** + **raw-query in aggregate** to inform generation. Building on
this (rather than a per-click raw query that doesn't exist) keeps the plan real.

**3. Guardrailed auto-publish needs a brand-claims corpus + validation + kill-switch.**
Since copy goes live with no human gate, the safety is structural: (a) generation may only draw from an
**approved facts/claims corpus** (features, stats, pricing, proof points — all pre-vetted by you);
(b) **hard bans** in the system prompt — no inventing features, no competitor claims, no legal/compliance
claims beyond the approved list, **never cite the FTC CARS rule (dead)**, no fabricated numbers;
(c) a **validation pass** on every generated variation before it renders (rules-based lint + a cheap
secondary check); (d) **every generated variation logged** with its context for audit; (e) a global
**kill-switch + one-click rollback** to the static page, and an automatic fallback if generation fails
or fails validation. The corpus is the backbone — auto-publish is only as safe as it is.

**4. The new site isn't live yet → build on staging, gate on cutover.**
`dealeraddendums.com` still points at the **legacy Laravel site**; the marketing DNS cutover + Keystatic
Cloud are pending. The engine only earns its keep once real Google ad traffic hits the new site, so we
build/test on a **staging subdomain** (e.g. `new.dealeraddendums.com`) with seeded traffic, and treat
cutover as the go-live gate. Keystatic Cloud (for the static fallback content + authoring the brand
corpus) is a parallel dependency.

---

## Phased plan

### Phase 1 — Per-visitor personalization (BUILD FIRST)
Real-time, context-cached, guardrailed tailoring of the **hero** on `/` and `/lp/[slug]`.
- **Signals:** extend `src/middleware.ts` (already captures UTM/`gclid`/attribution/dealer-type) to also
  read the matched **`{keyword}`** from the ad URL, compute a stable **context key**, and pass it on.
- **Generate:** a guardrailed real-time generator (extend `@/lib/ai`; new `src/app/api/personalize`
  route or a server util) → returns a tailored hero `{ headline, subheadline, ctaText, proofLine,
  featuredBenefits[] }` for the context, **cached by context key**, **validated**, with **static
  fallback**.
- **Render:** `src/app/page.tsx` + `src/app/lp/[slug]/page.tsx` consume the context and render the
  tailored hero static-first (note: nothing reads the middleware `x-*` headers today — Phase 1 builds
  that consumption).
- **Measure:** tag PostHog events + `/api/leads` with `{ contextKey, variationId }` to seed the loop.
- **Not yet:** no bandit, no live spend — just bespoke copy per context + measurement + guardrail.

### Phase 2 — Self-optimizing bandit
Replace the fixed cookie split with a **contextual multi-armed bandit** (Thompson sampling /
epsilon-greedy) per context segment; objective = conversion rate; arms = the variations generated in
P1. Auto-shifts traffic to winners while still exploring. This is the "dynamic A/B."

### Phase 3 — Spend-aware + search-terms-informed
Wire the **Google Ads API**: (a) live **spend / cost-per-conversion** per keyword → reweight the bandit
objective by **ROI** (favor copy that converts your *expensive* clicks, not just the most clicks);
(b) the **Search Terms report** → feed Claude the real queries per ad group so its variations speak the
visitor's actual language.

### Phase 4 — Claude evaluation / auto-author loop + admin
Scheduled job: Claude reads PostHog + leads + spend, **evaluates** winners/losers per segment,
**authors** new variations, **retires** losers — the variant pool evolves itself. `/admin` dashboard
shows live performance + ROI by segment, Claude's recommendations, the **audit log of auto-published
copy**, and the kill-switch.

---

## Phase 1 prerequisites / open items for Allan
- **Brand/claims corpus** — the single most important input: the vetted set of facts, features, stats,
  pricing, and proof points the generator may use (and the hard "never say" list). You/Marlena author it
  (a Keystatic singleton or a config file). Auto-publish is only as safe as this.
- **Staging subdomain** (e.g. `new.dealeraddendums.com`) to build/test on before the DNS cutover; decide
  cutover timing.
- **PostHog live** — analytics is the feedback half of the loop; confirm it's wired (it's in the stack
  but verify events fire on the new site).
- **Cost caps** — per-context cache TTL + a daily generation budget; exceed → serve the static hero.
- **Google Ads API access** (OAuth + developer token) — needed for Phase 3; Phase 1 uses the URL
  `{keyword}` token only, so it isn't blocking for the first slice.

## Phase 1 acceptance / guardrail criteria
- A visitor from a Kia-keyword ad sees Kia-tailored hero copy; a used-car-keyword visitor sees used-car
  copy; an organic/no-keyword visitor sees the strong **static default** — all with fast first paint.
- Identical contexts are served from cache (no regeneration); generation never blocks the visible page.
- Every generated variation is **logged** (context + output); a forced bad/empty generation **falls back**
  to the static hero; the **kill-switch** reverts everyone to static instantly.
- Generated copy never invents a feature, never cites the FTC CARS rule, and stays within the approved
  corpus (spot-audit the log).
- PostHog shows views + conversions tagged with context + variation.
- **STOP for review before deploy**; build/test on staging first.
