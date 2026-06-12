# DA Marketing — North Star: an AI-native, full-funnel SEO + SEM operating system

> Owner: Allan. Created 2026-06-11. The ambition: not "a marketing site," but the best AI-native
> SEO/SEM engine in the dealer-tools category — Claude running organic + paid as one closed loop,
> optimized to **revenue**, on your own infra. The dynamic landing engine (`dynamic-landing-engine.md`)
> is one pillar of this. This is a north-star + roadmap, deliberately sequenced — cutting-edge, not
> overnight.

## The unfair advantage (why this can actually be best-in-class)
Every SEO/SEM tool on the market goes blind at the form submit. They optimize to **clicks and leads**
because that's all they can see. **You own the entire funnel** — the marketing site, the trial, the
paid conversion (DA Platform), the billing (da-billing), and the CRM (HubSpot). So this platform can
optimize ad spend and content to **actual paid revenue and lifetime value**, keyword by keyword. That's
the differentiator: *spend a dollar on the query that produces a paying dealer, not the query that
produces a tire-kicker.* No external tool can do that for you because no external tool can see your
trial→paid→LTV. That single capability is what makes "the best ever built (for this niche)" a real
claim rather than a slogan.

## The pillars

**A. Acquisition intelligence (SEM).** Google Ads API in the loop: monitor spend / CPA / ROAS per
keyword + campaign; mine the Search Terms report for new converting queries (→ spin up ad groups +
negative keywords); generate RSAs/assets/sitelinks per keyword cluster; recommend or (guardrailed)
auto-execute bid/budget shifts toward what produces *revenue*. Spend-aware, not click-aware.

**B. Conversion engine.** The **dynamic landing engine** — real-time, visitor-tailored, self-optimizing
hero copy, message-matched to the ad keyword (tight match → higher Quality Score → lower CPC → more
volume for the same budget). Already specced; Phase 1 is the beachhead. See `dynamic-landing-engine.md`.

**C. Organic engine (SEO).** AI + programmatic content at scale in your authority niche (addendums,
compliance, F&I, buyers guides): money pages across state × brand × use-case, internally linked,
continuously refreshed; technical SEO baked in (JSON-LD `SoftwareApplication`/`FAQ`/`Article`, Core Web
Vitals — shared with the landing engine — EN/ES `hreflang`, auto sitemap/robots/canonicals). You have
real topical authority here; most competitors don't.

**D. Answer-engine optimization (AEO/GEO) — the 2026 frontier.** Beyond ranking in Google: being the
source **ChatGPT, Perplexity, and Google AI Overviews cite** when a dealer asks "how do I print a
compliant addendum." Structured, citable, fact-dense content + entity signals; track your share-of-voice
in AI answers and optimize for it. This is where "cutting edge" is genuinely being defined right now.

**E. Full-funnel measurement + attribution.** The objective function for everything above: keyword →
page → engagement → lead → trial → **paid → LTV**, unified across da-marketing ↔ DA Platform ↔
da-billing ↔ HubSpot. This is the wiring that lets A/B/C/D optimize to money. (DA already has the HubSpot
Phase-14 sync + the new "DA User" contact flag + da-billing — the spine exists.)

**F. The strategist (Claude as the marketer).** Not just copy generation — an agent that reads all the
signals (rankings, spend, conversions, revenue, AI-answer share), runs the loop across organic + paid,
proposes and (within human-set guardrails) executes campaigns/content/bids/landing variations, and keeps
a full audit trail. Self-driving marketing with you setting the objective and the guardrails.

## Proposed sequence (each phase: STOP for review)
1. **Conversion beachhead** — landing engine Phase 1 (per-visitor personalization). Underway.
2. **Attribution spine (E)** — wire keyword→trial→paid→LTV so the system has a revenue objective. This
   is the highest-leverage early build; without it everything optimizes to leads, not dollars.
3. **Acquisition intelligence (A)** — Google Ads API: query mining + negatives + spend-aware bidding to ROAS.
4. **Organic engine (C)** + technical SEO — programmatic money pages + structured data.
5. **AEO/GEO (D)** + the self-driving strategist (F) — as the data and guardrails mature.

## Honest guardrails / dependencies (so this stays real)
- **Foundation first:** the new site isn't live (DNS → legacy Laravel); Keystatic is local-mode. Cutover
  + Keystatic Cloud are prerequisites to real traffic. Build on a staging subdomain.
- **External gates:** Google Ads API (developer token + OAuth approval), and any auto-execution of bids
  needs a hard spend cap + kill-switch. AEO is an emerging, partly-unmeasurable space — treat as R&D.
- **Brand safety:** the approved-claims corpus + validation + audit (from the landing-engine spec)
  governs every AI-published word — ads, pages, and answers alike. Never resurrect the dead FTC CARS rule.
- **Sequencing is the point:** this is a multi-quarter program. Each pillar is a real build; the win comes
  from doing them in order so each one compounds on the attribution spine.

## The objective — DECIDED 2026-06-11: paid revenue + LTV
The AI optimizes every page, ad, and dollar toward **paying dealers and lifetime value** — not leads,
not raw trials. This locks the **attribution spine (Pillar E)** as a near-term priority: it's the
objective backbone every other pillar reads from, and it commits the system to its unfair advantage —
spend flows to the queries that produce paying dealers. Leads/trials stay as upstream signals, but the
optimizer's *reward* is revenue/LTV.
