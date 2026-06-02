-- 003_reputation.sql
-- DA Reputation Manager — Google Business Profile reviews, review-request campaigns,
-- and private negative-feedback capture for DealerAddendums' own GBP reputation.
--
-- Apply via the Supabase SQL editor (project huqohncglbshwuzeguvb) or `supabase db push`.

-- ── Google OAuth token storage for the GBP API ───────────────────────────────
create table if not exists gbp_credentials (
  id            uuid primary key default gen_random_uuid(),
  access_token  text not null,
  refresh_token text not null,
  token_expiry  timestamptz not null,
  account_name  text,                       -- Google Business Profile account name
  location_name text,                        -- GBP location resource name (accounts/xxx/locations/xxx)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Cached reviews pulled from Google ────────────────────────────────────────
create table if not exists gbp_reviews (
  id                uuid primary key default gen_random_uuid(),
  review_id         text unique not null,    -- Google's review name/ID
  reviewer_name     text,
  reviewer_photo_url text,
  star_rating       text,                    -- ONE/TWO/THREE/FOUR/FIVE
  comment           text,
  create_time       timestamptz,
  update_time       timestamptz,
  reply_comment     text,
  reply_update_time timestamptz,
  status            text default 'unread',   -- unread, read, replied, flagged
  ai_draft          text,                    -- Claude-generated draft response
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists gbp_reviews_status_idx      on gbp_reviews (status);
create index if not exists gbp_reviews_create_time_idx on gbp_reviews (create_time desc);

-- ── Campaign batches ─────────────────────────────────────────────────────────
create table if not exists review_campaigns (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  segment                text,               -- e.g. "active_90_days", "all_active", "manual"
  total_sent             integer default 0,
  total_opened           integer default 0,
  total_clicked_positive integer default 0,
  total_clicked_negative integer default 0,
  total_reviewed         integer default 0,
  sent_at                timestamptz,
  created_at             timestamptz default now()
);

-- ── Review request recipients ────────────────────────────────────────────────
create table if not exists review_requests (
  id                 uuid primary key default gen_random_uuid(),
  dealer_supabase_id text not null,          -- from DA Platform (or 'manual' for CSV uploads)
  dealer_name        text not null,
  contact_name       text,
  contact_email      text not null,
  status             text default 'pending', -- pending, sent, opened, clicked_positive, clicked_negative, reviewed
  sent_at            timestamptz,
  opened_at          timestamptz,
  clicked_at         timestamptz,
  campaign_id        uuid references review_campaigns(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists review_requests_campaign_idx on review_requests (campaign_id);
create index if not exists review_requests_status_idx   on review_requests (status);

-- ── Negative-sentiment private feedback ──────────────────────────────────────
create table if not exists private_feedback (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references review_requests(id),
  dealer_name   text,
  contact_email text,
  feedback_text text,
  resolved      boolean default false,
  resolved_at   timestamptz,
  notes         text,
  created_at    timestamptz default now()
);

-- ── Single-row module config (review page URL, etc.) ─────────────────────────
create table if not exists reputation_settings (
  id              integer primary key default 1,
  review_page_url text,                       -- DA's public Google review URL (used in campaign emails)
  updated_at      timestamptz default now(),
  constraint reputation_settings_singleton check (id = 1)
);
insert into reputation_settings (id, review_page_url)
values (1, 'https://search.google.com/local/writereview?placeid=REPLACE_WITH_DA_PLACE_ID')
on conflict (id) do nothing;
