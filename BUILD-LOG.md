# Build Log — DA Marketing OS

One line per working session. Appended at the **end of every session**,
without being asked. Newest at the bottom.

Columns: date · wall clock · Claude Code active · operator time · phase ·
what shipped.

"Wall clock" is calendar time from first to last action of the phase.
"CC active" is time Claude Code spent actually working. "Operator" is
Allan's own hands-on time — IAM, keys, passphrases, pasting things into
terminals, decisions.

---

## Schema audit + drift capture
**Sep 8, 2026** · 09:22 – 10:10 PDT (~48m wall clock) · ~45m CC active ·
~2m operator (the go-ahead on three items)

Shipped: migrations **010** (retroactive drift capture) and **011** (RLS on
`hero_cache` + `generated_variations`, applied to prod), a corrected
`self_serve_signups` reference in `da-ops/CLAUDE.md`, a new Supabase-schema
section in `CLAUDE-da-marketing-os.md` documenting the RLS model and the
cross-repo boundary, and this log.

The audit that prompted it: all 9 existing migrations were confirmed applied
by object existence, since this project has **no migration-tracking table**
(no `supabase_migrations` schema) — file presence never proves applied here.

Notable — the drift was larger than the reported part. Diffing the full live
schema against a scratch PostgreSQL 16 database built from 001–009 (columns,
indexes, constraints, triggers, functions, sequences, views, RLS) surfaced two
things, not one. The known part: five `marketing_leads` columns (`zip`,
`confirm_token`, `confirm_sent_at`, `confirmed_at`, `source_ip`) plus the
partial unique index on `confirm_token`, hand-applied during the 2026-09-03
signup hardening. These are load-bearing — `lib/lead-confirm.ts` keys
confirmation and its resend throttle on them — so a rebuild from migrations
alone produced a schema where self-serve signup breaks at runtime. The
unreported part: **RLS had been hand-enabled on 11 tables** that no migration
ever touched, so a rebuilt database would also have been world-readable
through the anon key. Both are now in 010. No trigger, function, sequence,
view or constraint drift.

`hero_cache` and `generated_variations` were the only two tables without RLS —
missed when it was rolled across the rest by hand. That is a real change to
production rather than drift capture, so it went in 011 separately. The
exposure was not theoretical: before the change, the anon key that ships in
the public site's JavaScript returned full rows from both tables, including
every AI prompt input and model output in the generation audit log. After:
`[]` from anon, while service-role reads **and** the `hero_cache` upsert the
hero engine depends on still work (probe row written and cleaned up).

Verification: 001–010 against prod-as-it-stood diffed to **zero differences
across 280 schema objects**; after applying 011, 001–011 against prod diffed
to zero again, with all 16 tables now default-deny. 010 and 011 were each
re-run twice on the scratch database to prove idempotency (notices only,
exit 0). The scratch cluster was isolated on port 55432 and torn down —
Allan's own Postgres was never started.

Also corrected: `self_serve_signups` was documented ambiguously in the
2026-09-03 session entry, in a passage describing work that spanned both
repos. It is a **da-platform** table (its migration 154, project
`byouefbebqgffhtfdggu`, backing `lib/signup-guard.ts`) — confirmed present
there and absent from this project. Both CLAUDE files now say so explicitly,
so a future session doesn't recreate it in the marketing database.

**Not closed:** 010 is a no-op against prod by design, but it has not been
*run* against prod — nothing to apply, though a `supabase db push` style
replay would touch it. `reputation_settings.review_page_url` is still the
`REPLACE_WITH_DA_PLACE_ID` placeholder from migration 003's seed. And the
absent migration-tracking table means the next audit is another object-by-object
diff; adopting the scratch-DB diff as the standing check would make it a
one-command answer.

---

## Google Ads + Search Console reconciled with the live APIs
**Sep 11, 2026** · 12:26 – 13:05 PDT (~39m wall clock) · ~37m CC active ·
~0m operator (Cloud-side scopes and Ads API enablement were done before the session)

Shipped: `e4182c5` — the Ads tab reports real campaign data and the SEO tab
returns real Search Console data, both for the first time. Plus `b9b7b0c`, a
file-level catch-up committing the Sep 8 migrations (010, 011) and build log
that had been left untracked, so the repo again contains the migrations that
describe production.

Both tabs were broken, for unrelated reasons, and in both cases the message on
screen pointed away from the cause. The session's actual work was a diagnosis:
calling Google directly with the stored refresh token before touching code.
That took one script and settled everything.

**Ads had three independently fatal faults.** The developer token was the
red herring — Google retired developer tokens on 2026-09-09, and
`listAccessibleCustomers` answers 200 with no such header at all, which the
diagnostic confirmed in one call. Worse, the old code *gated the whole panel*
on that token being present, so the tab would have kept saying "awaiting Basic
Access" forever no matter what Google approved. Second, v18 → v25 turns out to
reject `pageSize` outright (`PAGE_SIZE_NOT_SUPPORTED`, fixed 10,000-row pages)
and the old client sent `pageSize: 1000` on every request — so every query was
a hard 400 even with perfect auth. Third, and the one that actually produced
the 403s on screen: `GOOGLE_ADS_LOGIN_CUSTOMER_ID=6947440699` named a manager
account this grant cannot access, and Google's reply to that is
`USER_PERMISSION_DENIED` with a message *suggesting you set a
login-customer-id* — advice that is exactly backwards when a wrong one is the
problem. Both reachable accounts are non-manager, so the header must be absent.

**Search Console was a wrong identifier wearing a permissions costume.** The
error read `User does not have sufficient permission for site
'https://www.dealeraddendums.com'`, which sent the previous session looking for
a missing grant or a service account to authorize. There is no service account
anywhere in this integration — GA4, Ads and Search Console all authenticate as
the one OAuth user, and `sites.list` showed that user is `siteOwner` of exactly
one property: `sc-domain:dealeraddendums.com`. A URL-prefix property and a
domain property are different objects, so the configured string simply did not
exist in the account, and asking for a property you don't own is a 403 rather
than a 404. The domain form returned data immediately.

Rather than just correcting the string, the property is now resolved at query
time from Google's own `sites.list` — explicit value first when it is real,
then its slash/`sc-domain` variants, then the sole usable property. Verified
both directions: with the correct value it resolves `env`; with the old wrong
value temporarily restored it resolves `variant-of-env` and returns identical
data. The tab now survives a future property or domain change.

Scopes got the same treatment. The consent screen was widened earlier in the
day, but adding scopes to a *request* never widens an existing *grant* — so
readiness badges now read the scopes the stored grant actually holds, and the
connect panel offers "Reconnect to grant new permissions" naming exactly what
is absent. The live grant already had `adwords`, so Ads needed no reconnect at
all; only Business Profile and Indexing do. `exchangeCodeAndStore` was also
hardened to never overwrite a stored refresh token with null — it previously
threw before updating scopes, which would have turned a successful re-consent
into a dead connection.

The lasting fix is the logging. Both clients now dump the complete Google error
body, the GAQL query, and Google's requestId. Every fault in this session was
named explicitly in a response body nobody was printing.

Verified live over the 30 days to Sep 11: Ads/Dealer Addendums 3,185 impressions,
460 clicks, 14.44% CTR, $7.05 avg CPC, $3,241.72 cost, 15.5 conversions across
12 campaigns; Ads/Little Farm 2,366 impressions, 27 clicks; SEO 317 clicks,
2,621 impressions, 12.09% CTR, avg position 6.67. Analytics was deliberately
untouched and re-checked unchanged at 41,202 sessions.

**No migration** — `google_connection.scopes` already held everything the
scope-gap logic needed, and Ads accounts are discovered at runtime rather than
stored.

Two corrections to the docs fell out of it. The live box is **54.176.9.39**
(us-west-1); `18.212.227.125` is a stale June copy that still answers on :3020
and looks plausible if you land on it — it has no `.env.production` and none of
the Google work. And the deploy line said `git pull && npm run build && pm2
restart`, which is the failure mode `deploy.sh` was written to prevent.

**Not closed:** the reference implementation named for this work
(`agencykiller.tar.gz`) was not on the Mac, the live box, or the stale box, so
the port was done from the written spec and verified against the live API
instead. `business.manage` and `indexing` stay ungranted until Allan clicks
reconnect. Pre-existing and unrelated: `ImageError: "url" parameter is valid
but upstream response is invalid` recurs in the pm2 log from the Next image
optimizer, predating this deploy.

---

## Analyst — Claude reads Ads, Search Console and GA4 together
**Sep 11, 2026** · 13:10 – 14:25 PDT (~75m wall clock) · ~70m CC active ·
~2m operator (pasting migration 012, and the answer on how to apply it)

Shipped: `e123a22` + `e8bcf3a` — an Analyst tab that assembles a marketing
snapshot from the three live Google integrations, sends it to Claude
(`claude-sonnet-5`), and renders a structured brief: findings → diagnoses →
prioritized recommendations. Migration 012 (`analyses`) stores every run.
Read-only in both directions; nothing in this path can change a campaign.

The design decision that mattered was not the API call — it was deciding what
the model is allowed to believe. A snapshot of numbers cannot distinguish "zero
happened" from "zero recorded", and this account has a live example of exactly
that: GA4 reports 0 conversions, the funnel's signup value is a hardcoded 0 in
the GA4 client rather than a measurement, and `form_start` has never been
tracked. A brief handed those numbers raw would confidently recommend bid and
budget changes optimised toward a metric nobody is recording. So instrumentation
state is computed from the fetched data and passed in as its own `measurement`
block, with the system prompt required to establish tracking integrity before
any tactical advice and to raise a critical measurement finding whenever a gap
exists. Every flag is derived, not asserted, so it stops being raised the moment
the gap is fixed.

That earned its keep on the first real run. The brief led with the conversion
signal being broken — and then found something nobody had told it: Google Ads
reports 15.5 conversions for the same account and period where GA4 reports 0,
so neither number can be trusted until the Ads conversion action is audited
against first-party signup records. It also declined to act on the one
juicy-looking finding, noting that a $337 vs $104 cost-per-conversion gap
between two campaigns rests on 7 and 8.5 conversions and is too small to move
budget on. Recommendations 1–3 are all tracking fixes; the campaign work is
ranked below them.

Three engineering choices are worth remembering. The client is a raw `fetch`
rather than the installed SDK: this project pins `@anthropic-ai/sdk` at
`^0.20.0`, which predates the parameters used, and `lib/ai.ts` is shared with
the live chat widget and the reputation reply drafter — bumping it to reach
newer parameters would move two unrelated features onto a new client version.
The snapshot deliberately bypasses `lib/google/cache.ts`, because pressing "Run
analysis" means *look at the data now*, and reusing the tabs' cache keys with
different row limits would let a 25-row cached entry satisfy a 50-row request.
And the concurrency guard is an in-process flag, which is a real lock only
while da-marketing runs as a single PM2 fork — noted in the code for the day
that changes.

One bug came out of testing rather than review. The first live run generated a
brief fine but stored nothing, and showed the raw database message instead of
the migration hint: `isMissingTable` matched only Postgres's `42P01`, while
supabase-js answers through PostgREST, which reports an unknown relation as
`PGRST205` — "Could not find the table 'public.analyses' in the schema cache".
Fixed in `e8bcf3a` to match both shapes.

Verified after Allan applied 012: run stored (`status=ok`, brief and snapshot
both persisted, `raw_response` null as intended for a success), `/latest` and
`/history` return it, `?id=` expands a history row's full brief, a second
concurrent run gets 409 and the lock releases when the in-flight run finishes
(the queued run completed and saved on its own), and the anon key reads `[]`
from `analyses` — which matters more here than most tables, because a row holds
full campaign spend and the entire marketing dataset. Snapshot came in at
~2,700 tokens against the ~15k target; runs cost ~$0.08–0.12 and take 65–100
seconds.

**Not closed:** the write path. Recommendations are text today. Migration 009
already ships `proposed_changes` (with `source='ai'`) and `change_audit`, and
the Approvals tab renders that queue empty — the intended evolution is Analyst
emits proposals → human approves → an applier executes. Deliberately not built:
`lib/google/ads.ts` still exposes no mutate surface at all, so there is no code
path in this repo that can spend money, and that is worth keeping until the
approval queue is real. Also open: GBP is the next snapshot source but needs
both Google's API approval and a reconnect for the `business.manage` scope, and
`lib/gbp.ts` is still stubbed — when it lands it needs a `gbpIsStubbed` flag so
a brief can never mistake mock reviews for real ones.
