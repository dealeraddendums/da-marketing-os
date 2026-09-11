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
