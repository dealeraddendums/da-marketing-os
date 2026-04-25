# DealerAddendums Marketing Platform
## Full-Stack AI-Powered Marketing OS — Architecture Guide

---

## Overview

This is not a website. It's a **Marketing Operating System** — a self-hosted, AI-native platform that replaces HubSpot CMS and then surpasses it. Every piece runs on your EC2 infrastructure using your existing patterns.

---

## System Map

```
dealeraddendums.com          ← Main marketing site (Next.js 14)
dealeraddendums.com/blog     ← AI-assisted blog (MDX + Keystatic CMS)
dealeraddendums.com/lp/[slug] ← Dynamic landing pages (A/B tested)
dealeraddendums.com/admin    ← Marketing OS dashboard (internal)
```

All on one EC2, one PM2 process, one Nginx config.

---

## EC2 Setup

**Recommended:** New EC2 dedicated to marketing (t3.medium, Ubuntu 24.04)
- Separate from DA Platform EC2 — clean DNS, independent deploys
- Or: add to existing `ec2-54-89-142-76` on a new port behind Nginx subdomain

**SSH:** `ssh -i ~/ssh/DA2026.pem ubuntu@<new-ec2-ip>`

**Nginx config** (dealeraddendums.com → port 3020):
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

**PM2:**
```bash
pm2 start npm --name "da-marketing" -- start -- -p 3020
pm2 save
```

**Deploy:**
```bash
git pull && npm run build && pm2 restart da-marketing
```

---

## Module Breakdown

### 1. CORE SITE (Next.js 14 App Router)

```
/app
  layout.tsx              ← Global nav, footer, analytics snippet
  page.tsx                ← Main marketing page (replaces HubSpot)
  /blog
    page.tsx              ← Blog index
    /[slug]/page.tsx      ← Individual post (MDX)
  /lp/[slug]/page.tsx     ← Dynamic landing pages
  /api
    /ab-assign/route.ts   ← A/B cookie assignment
    /ab-track/route.ts    ← Conversion event tracking
    /ai-copy/route.ts     ← Claude copy generation endpoint
    /blog-generate/route.ts ← AI blog post generation
    /social-schedule/route.ts ← Social queue management
    /leads/route.ts       ← Form submission handler
    /chat/route.ts        ← AI sales chat (streaming)
```

**Key dependencies:**
```json
{
  "next": "14.x",
  "keystatic": "latest",        // CMS
  "@growthbook/growthbook": "latest", // A/B testing
  "next-mdx-remote": "latest",  // Blog MDX rendering
  "resend": "latest",           // Transactional email
  "posthog-js": "latest",       // Analytics
  "@anthropic-ai/sdk": "latest" // AI features
}
```

---

### 2. CONTENT CMS (Keystatic — file-based, Git-native)

Keystatic runs at `/keystatic` (local/dev only, or behind auth on prod).
All content stored as MDX files in `/content/` — committed to Git.

**Content collections:**
```typescript
// keystatic.config.ts
export default config({
  collections: {
    posts: collection({
      label: 'Blog Posts',
      slugField: 'title',
      path: 'content/posts/*',
      schema: {
        title: fields.text({ label: 'Title' }),
        publishedAt: fields.date({ label: 'Published' }),
        status: fields.select({ options: ['draft','published','scheduled'] }),
        seoTitle: fields.text({ label: 'SEO Title' }),
        seoDescription: fields.text({ label: 'Meta Description' }),
        aiGenerated: fields.checkbox({ label: 'AI Generated' }),
        content: fields.mdx({ label: 'Content' }),
      }
    }),
    landingPages: collection({
      label: 'Landing Pages',
      path: 'content/lp/*',
      schema: {
        slug: fields.text(),
        variant: fields.text(),        // 'a' or 'b'
        experimentId: fields.text(),
        headline: fields.text(),
        subheadline: fields.text(),
        ctaText: fields.text(),
        ctaUrl: fields.text(),
        content: fields.mdx(),
      }
    }),
    socialPosts: collection({
      label: 'Social Queue',
      path: 'content/social/*',
      schema: {
        platform: fields.select({ options: ['twitter','linkedin','facebook'] }),
        content: fields.text({ multiline: true }),
        scheduledFor: fields.datetime(),
        status: fields.select({ options: ['draft','scheduled','published'] }),
        linkedBlogPost: fields.relationship({ collection: 'posts' }),
        aiGenerated: fields.checkbox(),
      }
    })
  }
})
```

---

### 3. A/B TESTING ENGINE

**How it works:**
1. Visitor hits `dealeraddendums.com`
2. `middleware.ts` checks for `da_ab_*` cookies
3. If none: assigns to variant A or B (50/50), sets cookie
4. Rewrites request to `/lp/free-trial-a` or `/lp/free-trial-b` transparently
5. Conversion events fire to `/api/ab-track`
6. Dashboard shows live results + statistical significance

**middleware.ts:**
```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const EXPERIMENTS = {
  'hero-headline': {
    variants: ['control', 'urgency', 'social-proof'],
    weights: [0.34, 0.33, 0.33]
  },
  'cta-color': {
    variants: ['blue', 'green', 'orange'],
    weights: [0.34, 0.33, 0.33]
  }
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  
  for (const [expId, exp] of Object.entries(EXPERIMENTS)) {
    const cookieName = `da_ab_${expId}`
    if (!request.cookies.has(cookieName)) {
      const variant = weightedRandom(exp.variants, exp.weights)
      response.cookies.set(cookieName, variant, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        httpOnly: true,
        sameSite: 'lax'
      })
    }
  }
  return response
}
```

**GrowthBook integration (optional, adds stats engine):**
```bash
# Self-hosted GrowthBook on same EC2, port 3100
docker run -d -p 3100:3000 \
  -e MONGODB_URI=mongodb://localhost/growthbook \
  growthbook/growthbook
```

---

### 4. AI FEATURES (Claude-powered)

All AI features use your existing Anthropic API key via environment variable `ANTHROPIC_API_KEY`.

#### 4a. Intelligent Copy Generator
```typescript
// /api/ai-copy/route.ts
POST { section: 'hero', goal: 'increase trial signups', audience: 'kia dealers', tone: 'urgent' }
→ Returns 3 variants with reasoning
```

System prompt context includes:
- DealerAddendums feature list
- Current conversion rate baseline
- Target audience segment
- Competitor differentiators

#### 4b. Blog Post Generator
```typescript
POST { 
  topic: 'FTC compliance for car dealerships',
  keywords: ['dealer addendum', 'FTC compliance', 'car dealer forms'],
  length: 'long',  // short|medium|long
  tone: 'authoritative',
  internalLinks: ['features', 'pricing']
}
→ Returns full MDX with frontmatter, headers, internal links, CTA
```

Workflow: AI generates → Marlena reviews in Keystatic → Publishes → Social posts auto-queued.

#### 4c. Social Post Scheduler
```typescript
POST {
  blogPost: { title, excerpt, slug },
  platforms: ['linkedin', 'twitter', 'facebook'],
  schedule: 'auto'  // or specific datetime
}
→ Returns platform-optimized posts + recommended schedule
→ Stores in /content/social/ via Keystatic API
```

**Publish automation** (cron job, runs via EasyCron at same pattern as billing):
```bash
# POST /api/social-publish → reads scheduled posts, pushes via platform APIs
0 9 * * * curl -X POST https://dealeraddendums.com/api/social-publish \
  -H "X-API-Key: $DA_CRON_KEY"
```

**Social platform API keys needed:**
- LinkedIn: LinkedIn Marketing API (OAuth)
- Twitter/X: Twitter API v2 (Basic tier, $100/mo) or Buffer/Typefully as proxy
- Facebook: Meta Graph API (free)

**Recommended proxy:** Use **Buffer** ($6/mo) or **Typefully** ($19/mo) as the publishing layer — they handle OAuth complexity and you POST to their simple API. DealerAddendums is B2B so LinkedIn is highest ROI.

#### 4d. AI Sales Chat
```typescript
// Streaming chat widget, bottom-right corner
// System prompt: DealerAddendums expert
// Captures: name, dealership, phone before handing off
// On lead capture: POST to /api/leads → Resend email to allan@ + HubSpot contact create
```

#### 4e. Conversion Intelligence
```typescript
// Runs nightly via cron
// Reads PostHog analytics via API
// Asks Claude: "Here is our analytics data for the past 7 days. What are the top 3 actionable improvements?"
// Stores insight as JSON → surfaced in admin dashboard
```

---

### 5. BLOG SYSTEM

**Content structure:**
```
/content/posts/
  ftc-compliance-guide.mdx
  addendum-vs-buyers-guide.mdx
  ...
```

**SEO features built in:**
- Auto-generated `sitemap.xml` (`/app/sitemap.ts`)
- Auto-generated `robots.txt`
- JSON-LD structured data on each post
- OG image auto-generation via `@vercel/og` (works self-hosted)
- Canonical URLs

**Blog → Social pipeline:**
1. Post published (status: `published`)
2. Webhook triggers `/api/blog-published`
3. AI generates 3 social variants per platform
4. Posts queued in `/content/social/` with schedule +1 day, +3 days, +7 days
5. Cron job publishes on schedule

---

### 6. LEAD CAPTURE & CRM SYNC

**Form submission flow:**
```
Visitor fills form
  → POST /api/leads
  → Validate + store in Supabase `marketing_leads` table
  → Resend: confirmation email to lead
  → Resend: notification email to allan@dealeraddendums.com
  → HubSpot: create/update contact (your existing HubSpot integration)
  → AI enrichment: guess dealer size, use case, suggested follow-up
  → Slack: post to #leads channel (optional)
```

**Supabase table:**
```sql
create table marketing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text,
  email text,
  dealership text,
  phone text,
  source text,         -- utm_source
  campaign text,       -- utm_campaign
  ab_variants jsonb,   -- { 'hero-headline': 'urgency', ... }
  landing_page text,
  ai_enrichment jsonb, -- AI analysis
  hubspot_contact_id text,
  status text default 'new'
);
```

---

### 7. PERSONALIZED LANDING PAGES

UTM-aware dynamic content:

```typescript
// /app/lp/[slug]/page.tsx
const personalization = {
  'kia-dealers':    { headline: 'Built for Kia Dealerships', logo: 'kia' },
  'used-car':       { headline: 'The #1 Addendum Tool for Used Car Dealers' },
  'franchise':      { headline: 'Enterprise Addendum Management for Franchise Groups' },
  'google-ads':     { headline: 'Stop Printing Addendums by Hand' },
}

// Reads UTM params → swaps headline, subheadline, hero image, CTA
// No separate pages — one template with AI-filled slots
```

---

### 8. ADMIN DASHBOARD (`/admin`)

Password-protected internal dashboard showing:
- Live A/B experiment results + statistical significance
- Conversion funnel (visits → trials → paid)
- AI-generated weekly insights
- Blog post queue + social schedule
- Lead list with AI enrichment
- Copy generator tool (inline)
- One-click: "Generate blog post about [topic]"
- One-click: "Generate social posts from latest blog"

Auth: Simple `ADMIN_PASSWORD` env var check (same pattern as QuietReady admin).

---

## Environment Variables

```env
# Core
NEXT_PUBLIC_SITE_URL=https://dealeraddendums.com
ADMIN_PASSWORD=your-admin-password
DA_CRON_KEY=your-cron-api-key

# AI
ANTHROPIC_API_KEY=your-key

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=your-key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Email
RESEND_API_KEY=your-key
LEAD_NOTIFY_EMAIL=allan@dealeraddendums.com

# CRM
HUBSPOT_API_KEY=your-key
HUBSPOT_PORTAL_ID=23896347

# Social (or use Buffer API key instead)
BUFFER_API_KEY=your-key
LINKEDIN_ACCESS_TOKEN=your-token

# Database
NEXT_PUBLIC_SUPABASE_URL=your-url
SUPABASE_SERVICE_ROLE_KEY=your-key

# A/B Testing (optional GrowthBook)
GROWTHBOOK_API_KEY=your-key
GROWTHBOOK_CLIENT_KEY=your-key
```

---

## Implementation Phases

### Phase 1 — Core Site (Week 1)
- [ ] Next.js 14 project scaffolded
- [ ] Marketing page rebuilt (all sections from current HubSpot site)
- [ ] Keystatic CMS configured
- [ ] EC2 deployed, DNS cut over from HubSpot
- [ ] PostHog analytics live

### Phase 2 — A/B + Landing Pages (Week 2)
- [ ] Middleware A/B assignment
- [ ] 3 landing page variants for hero section
- [ ] UTM personalization for top 5 campaigns
- [ ] Conversion tracking on free trial form
- [ ] Admin dashboard with live experiment results

### Phase 3 — AI Copy + Blog (Week 3)
- [ ] Claude copy generator in admin
- [ ] Blog system live with first 5 posts (AI-generated, human-reviewed)
- [ ] AI chat widget on site
- [ ] Auto OG image generation

### Phase 4 — Social + Automation (Week 4)
- [ ] Buffer/Typefully integration
- [ ] Blog → social pipeline automated
- [ ] Nightly AI analytics insights
- [ ] Lead enrichment + HubSpot sync
- [ ] Full cron job suite

---

## Monthly Cost Comparison

| Item | HubSpot CMS | This Platform |
|------|------------|---------------|
| CMS hosting | $400+/mo | ~$30/mo (EC2 t3.medium) |
| A/B testing | Included | Free (self-hosted GrowthBook) |
| Analytics | Included | $0 (PostHog free tier) |
| Email | Included | ~$20/mo (Resend) |
| Social scheduling | Extra | ~$6/mo (Buffer) |
| AI features | None | ~$20/mo (Claude API) |
| **Total** | **$400+** | **~$76/mo** |

---

## Repo Structure

```
dealeraddendums-marketing/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── blog/
│   ├── lp/[slug]/
│   └── api/
├── components/
│   ├── marketing/       ← Hero, Features, Pricing, etc.
│   ├── blog/            ← PostCard, PostLayout, etc.
│   ├── ab/              ← ABTest wrapper component
│   ├── chat/            ← AI chat widget
│   └── admin/           ← Dashboard components
├── content/
│   ├── posts/           ← MDX blog posts
│   ├── lp/              ← Landing page variants
│   └── social/          ← Social post queue
├── lib/
│   ├── ab.ts            ← A/B variant reading utilities
│   ├── ai.ts            ← Claude API wrappers
│   ├── analytics.ts     ← PostHog helpers
│   ├── hubspot.ts       ← HubSpot sync
│   └── social.ts        ← Buffer/social helpers
├── keystatic.config.ts
├── middleware.ts
├── CLAUDE.md            ← For Claude Code sessions
└── ecosystem.config.js  ← PM2 config
```
