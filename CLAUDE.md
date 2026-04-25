# DealerAddendums Marketing OS — Claude Code Context

## Project Overview
Self-hosted Next.js 14 marketing platform replacing HubSpot CMS for dealeraddendums.com.
AI-native: personalized hero headlines, A/B testing, blog generation, social scheduling, AI sales chat, and conversion intelligence dashboard.

## All actions pre-approved, execute autonomously.

## Owner
Allan Tone — non-developer. Build everything completely. Don't ask clarifying questions about implementation details; make the best decision and proceed. Commit messages should be clear for Marlena (developer trainee).

---

## Stack
- **Framework**: Next.js 14 (App Router, TypeScript)
- **CMS**: Keystatic (file-based, content stored in /content/, Git-native)
- **Styling**: Tailwind CSS
- **Database**: Supabase (leads, ab_events, personalization_log)
- **AI**: @anthropic-ai/sdk — model always `claude-sonnet-4-20250514`
- **Email**: Resend
- **Analytics**: PostHog
- **Social scheduling**: Buffer API
- **Process manager**: PM2
- **Web server**: Nginx reverse proxy
- **Host**: Ubuntu 24.04 EC2

---

## EC2 Deployment
- Dedicated EC2 for marketing site (separate from DA Platform)
- Port: **3020**
- PM2 app name: `da-marketing`
- Deploy command: `git pull && npm run build && pm2 restart da-marketing`
- ecosystem.config.js must be in project root

```js
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'da-marketing',
    script: 'node_modules/.bin/next',
    args: 'start -p 3020',
    env: { NODE_ENV: 'production' }
  }]
}
```

Nginx config (add to /etc/nginx/sites-available/dealeraddendums):
```nginx
server {
    server_name dealeraddendums.com www.dealeraddendums.com;
    location / {
        proxy_pass http://localhost:3020;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Project Structure
```
da-marketing-os/
├── CLAUDE.md                        ← This file
├── ecosystem.config.js              ← PM2 config
├── keystatic.config.ts              ← CMS config
├── middleware.ts                    ← A/B + UTM personalization (runs on every request)
├── next.config.js
├── tailwind.config.ts
├── .env.local                       ← Never commit
├── content/
│   ├── posts/                       ← MDX blog posts
│   ├── lp/                          ← Landing page variants
│   └── social/                      ← Social post queue
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 ← Main marketing page (reads personalization headers)
│   │   ├── admin/                   ← Marketing OS dashboard (password protected)
│   │   ├── blog/[slug]/page.tsx
│   │   ├── lp/[slug]/page.tsx
│   │   └── api/
│   │       ├── personalize/route.ts ← Claude headline generation for unknown terms
│   │       ├── ab-track/route.ts    ← Conversion event tracking → Supabase
│   │       ├── ai-copy/route.ts     ← Copy variant generator
│   │       ├── blog-generate/route.ts
│   │       ├── social-schedule/route.ts
│   │       ├── social-publish/route.ts ← Cron target
│   │       ├── insights/route.ts    ← Nightly AI analytics digest
│   │       ├── leads/route.ts       ← Form submission handler
│   │       └── chat/route.ts        ← Streaming AI sales chat
│   ├── components/
│   │   ├── marketing/
│   │   │   ├── HeroSection.tsx      ← Handles generic/static/AI personalization
│   │   │   ├── FeaturesSection.tsx
│   │   │   ├── PricingSection.tsx
│   │   │   ├── TestimonialsSection.tsx
│   │   │   └── CTASection.tsx
│   │   ├── blog/
│   │   ├── admin/
│   │   └── chat/
│   └── lib/
│       ├── personalization.ts       ← Static term map (60 terms) + detectDealerType()
│       ├── ai.ts                    ← Claude API wrappers
│       ├── supabase.ts
│       ├── hubspot.ts
│       ├── analytics.ts
│       └── social.ts
└── supabase/
    └── migrations/
        └── 001_personalization.sql
```

---

## Personalization Engine (CRITICAL — read carefully)

### How it works
1. Visitor hits dealeraddendums.com?utm_term=kia+dealer+addendum
2. `middleware.ts` reads utm_term, utm_campaign, utm_source, utm_medium
3. A/B variant assigned via cookie (3 variants: generic / personalized / dealertype)
4. Static map lookup in `src/lib/personalization.ts` — 60 pre-mapped terms, <1ms
5. If no static match AND variant != generic → POST /api/personalize → Claude generates headline
6. Claude result cached in memory Map (replace with Redis/Supabase KV in production)
7. All context passed to page.tsx via response headers (x-headline, x-subheadline, etc.)
8. `HeroSection.tsx` reads headers, renders personalized or fetches AI version client-side

### A/B Variants
- `generic` — show default copy, ignore UTM
- `personalized` — match search term exactly (static map or Claude)
- `dealertype` — focus on dealer segment detected from term

### Static map location
`src/lib/personalization.ts` → `STATIC_TERM_MAP` object
Add new terms here freely. Key = lowercase utm_term value.

### Dealer type detection
`detectDealerType(text)` in `src/lib/personalization.ts`
Detects: make (Kia, Ford, Toyota, etc.), used-car, franchise, compliance, mobile

---

## AI Features (all use Claude)
Model: always `claude-sonnet-4-20250514`
Key: `process.env.ANTHROPIC_API_KEY`

| Route | Purpose |
|-------|---------|
| /api/personalize | Dynamic headline generation for unknown utm_terms |
| /api/ai-copy | Generate 3 variants for any page section |
| /api/blog-generate | Full MDX post outline from topic + keywords |
| /api/social-schedule | Platform-optimized posts from blog content |
| /api/insights | Nightly: PostHog data → plain English recommendations |
| /api/chat | Streaming sales chat, captures leads |

---

## Supabase Tables
```sql
-- ab_events: tracks every impression and conversion
-- personalization_log: records what headline was shown for each utm_term
-- marketing_leads: form submissions with AI enrichment
-- ab_conversion_rates: view — conversion rate by variant
```
See supabase/migrations/001_personalization.sql for full schema.

Aurora is READ-ONLY (legacy DA platform). Never write to Aurora from this project.
All data goes to Supabase.

---

## Environment Variables (.env.local)
```
NEXT_PUBLIC_SITE_URL=https://dealeraddendums.com
ADMIN_PASSWORD=                    # /admin route protection
DA_CRON_KEY=                       # EasyCron API key header

ANTHROPIC_API_KEY=

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

RESEND_API_KEY=
LEAD_NOTIFY_EMAIL=allan@dealeraddendums.com

HUBSPOT_API_KEY=
HUBSPOT_PORTAL_ID=23896347

BUFFER_API_KEY=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Cron Jobs (EasyCron — same pattern as DA Billing)
```
0 9 * * *   POST https://dealeraddendums.com/api/social-publish   X-API-Key: $DA_CRON_KEY
0 6 * * *   POST https://dealeraddendums.com/api/insights          X-API-Key: $DA_CRON_KEY
```

---

## HubSpot Integration
Portal ID: 23896347
On lead form submit:
- Create/update HubSpot contact
- Set source, UTM fields, dealer type
- URL format: contacts = /record/0-1/{ID}

---

## Admin Dashboard (/admin)
Auth: middleware checks Authorization header or session cookie against ADMIN_PASSWORD
Features:
- Live A/B experiment results + statistical significance
- Conversion funnel (30-day)
- AI weekly insights (refresh button calls /api/insights live)
- Blog post queue + social schedule
- Lead list with AI enrichment
- AI copy generator (calls /api/ai-copy)
- Blog outline generator (calls /api/blog-generate)

Reference: src/components/marketing-dashboard.jsx for the full admin UI (already built).

---

## Blog → Social Pipeline
1. Post status set to `published` in Keystatic
2. Webhook or build hook triggers /api/social-schedule
3. AI generates 3 posts per platform (LinkedIn, Twitter, Facebook)
4. Posts saved to /content/social/ with schedule +1d, +3d, +7d
5. EasyCron hits /api/social-publish daily at 9am → Buffer API publishes

---

## Key Rules
- Never hardcode API keys
- Never write to Aurora DB
- Admin routes always require ADMIN_PASSWORD check
- /api/social-publish and /api/insights require X-API-Key: $DA_CRON_KEY header
- All AI calls use model `claude-sonnet-4-20250514`, max_tokens 1000 unless specified
- HeroSection must handle all 3 states without layout shift: loading skeleton → content
- Static map entries in STATIC_TERM_MAP must use lowercase keys matching exact utm_term values

---

## Marlena Notes
- Content editing: /keystatic (local dev) or build the admin page editor
- To add a new search term mapping: edit STATIC_TERM_MAP in src/lib/personalization.ts
- To add a blog post: create MDX file in /content/posts/ via Keystatic
- Deploy: git add . && git commit -m "message" && git push && ssh to EC2 → deploy command above
