-- 026_social_posts.sql — move the social queue from content/social/*.json flat
-- files into the database (the blog had this exact problem before migration
-- 024: disk writes on the running box don't survive a rebuild). One row per
-- queued social post.
--
-- Approval gate: rows are born 'pending'; nothing may be handed to a posting
-- integration unless status = 'approved'. The publisher marks 'published' +
-- published_at. 'rejected' rows are kept for the record.
--
-- RLS is on with ZERO policies (default-deny, the house pattern) — all access
-- is server-side via the service-role key. Never add a permissive policy.

create table if not exists social_posts (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null check (platform in ('linkedin','twitter','facebook')),
  content       text not null,
  post_slug     text not null,           -- blog_posts.slug this promotes
  url           text,                    -- the exact link included in the post (carries UTMs)
  status        text not null default 'pending' check (status in ('pending','approved','rejected','published')),
  scheduled_for timestamptz,             -- earliest time the publisher may post it (once approved)
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists social_posts_status_idx on social_posts (status, scheduled_for);
create index if not exists social_posts_slug_idx on social_posts (post_slug);

alter table social_posts enable row level security;
