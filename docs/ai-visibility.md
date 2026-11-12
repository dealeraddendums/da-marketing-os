# AI Visibility — measuring whether AI assistants mention DealerAddendums

Admin → **AI Visibility** tab. A weekly audit runs the target prompt list
(questions phrased the way a dealer would ask) through four AI engines with
live web search, and a deterministic parser records whether DealerAddendums is
mentioned/cited and which competitors are. Gaps (≥2 engines name a competitor
and not us) can be sent to the blog pipeline as draft topics with one click.

## Pieces

| Piece | Where |
|---|---|
| Migration + seed (25 prompts, 16 competitors) | `supabase/migrations/025_ai_visibility.sql` |
| Engine adapters (fetch-only, no SDKs) | `src/lib/ai-visibility/engines/*` |
| Parser (pure, deterministic, unit-tested) | `src/lib/ai-visibility/parse.ts` |
| Runner (cost cap, concurrency 3, retry-once) | `src/lib/ai-visibility/run.ts` |
| Report assembly | `src/lib/ai-visibility/store.ts` |
| Site readiness check (report only) | `src/lib/ai-visibility/site-check.ts` |
| API routes | `src/app/api/ai-visibility/{run,data,result,manage,gap-to-blog,site-check}` |
| Admin tab | `src/components/admin/AiVisibilityPanel.tsx` |
| Weekly entry point | `scripts/ai-visibility-run.mjs` |
| Parser tests | `npm run test:ai-visibility` |

The Analyst snapshot (`src/lib/analyst/snapshot.ts`) now carries an
`aiVisibility` summary (overall + per-engine %, top 5 gaps, competitors
gaining), and the brief schema gained the `ai_visibility` finding area — the
weekly Analyst brief comments on visibility. Analyst stays read-only.

## Engines & models

| Engine | Model (env override) | Search mechanism |
|---|---|---|
| ChatGPT | `gpt-4o-mini-search-preview` (`AI_VISIBILITY_OPENAI_MODEL`) | built-in web search, Chat Completions |
| Gemini | `gemini-2.5-flash` (`AI_VISIBILITY_GEMINI_MODEL`) | `google_search` grounding |
| Perplexity | `sonar` (`AI_VISIBILITY_PERPLEXITY_MODEL`) | search-native, returns citations |
| Claude | `claude-haiku-5-5` (`AI_VISIBILITY_ANTHROPIC_MODEL`) | `web_search` server tool (max 3 uses) |

Cheapest search-capable model on each, by design. All four adapters are plain
`fetch` — zero new dependencies (same reasoning as the Google integration:
the box's disk headroom).

## Env vars (in `.env.production` on the marketing box)

```
OPENAI_API_KEY=        # platform.openai.com
GEMINI_API_KEY=        # aistudio.google.com (Gemini API key, NOT the OAuth pair)
PERPLEXITY_API_KEY=    # perplexity.ai → API
ANTHROPIC_API_KEY=     # already present (Analyst)
```

An engine with no key is skipped (noted on the run and in the tab) — the audit
still runs on the engines that have keys.

## Cost expectations

~25 prompts × 4 engines = ~100 calls per run. Approximate per-run cost:

- ChatGPT gpt-5-search-api: ~$1.50 (search results arrive as ~15–20k prompt
  tokens per call at $1.25/M, plus search fee ≈ $25/1k calls)
- Gemini 3.8 Flash grounding: ~$0.50 (grounded queries ≈ $14/1k, counted at
  full rate; token intro rates double 2027-01-01)
- Perplexity sonar: ~$0.20
- Claude Haiku + web search: ~$0.65 (searches $10/1k, ≤3 per call)

**≈ $2.85 per full run, ~$12/month weekly.** The runner refuses to start when
the estimate exceeds the **$5 hard cap** (`COST_CAP_USD` in
`src/lib/ai-visibility/run.ts`), and refuses while another run is in flight.
Actual cost is computed from each engine's returned token usage and stored on
the run row and per result.

## Weekly schedule (PM2 cron, on the LIVE marketing box only)

```bash
cd /home/ubuntu/da-marketing-os
pm2 start scripts/ai-visibility-run.mjs --name ai-visibility-weekly \
  --cron "0 3 * * 0" --no-autorestart
pm2 save
```

`0 3 * * 0` is Sunday 03:00 **in the box's timezone** — the box runs UTC, so
use `--cron "0 11 * * 0"` for 03:00 Pacific (10:00 UTC during PDT; 11:00 keeps
it at 03:00 PST / 04:00 PDT without seasonal edits). The script kicks the run
off through `POST /api/ai-visibility/run` (header `x-api-key: DA_CRON_KEY`),
polls the run row until it finishes, and logs a one-line verdict
(`pm2 logs ai-visibility-weekly`). ⚠️ Never register this on the old
18.212.227.125 box — it does not serve the live site.

## Semantics

- **Visibility %** = prompts where `da_mentioned` (name in the answer, or our
  domain in the answer/citations) ÷ prompts answered, per engine.
- **position_rank** = DA's 1-based order among vendors by first appearance in
  the answer text (1 = first vendor named). Null when we're not in the text.
- **Gap** = a prompt where ≥2 engines named a competitor and not us.
  "Send to Blog pipeline" creates a `blog_posts` DRAFT (status `draft`, an
  `[ALLAN: …]` note in the body so the publish guard blocks it) — nothing is
  published; write it with the Blog & Social generator.
- **Competitor matching** is whole-word on names/aliases plus domain matching
  in answer text and citations. The seed list is best-effort — review it in
  the tab's Prompt manager (⚠ banner).
- Engine failures retry once on 429/5xx, then land on the result row's
  `error` column; a run with some failures finishes `partial`, never aborts.
- Deactivating a prompt keeps its history; hard delete (API only) cascades
  its results away.

## Site readiness check

One click in the tab (report only, no fixes): robots.txt verdicts for GPTBot,
Google-Extended, PerplexityBot, ClaudeBot, Bingbot; `/llms.txt` presence;
JSON-LD on the homepage (Organization, SoftwareApplication) and the newest
published blog post (Article/BlogPosting, FAQPage).
