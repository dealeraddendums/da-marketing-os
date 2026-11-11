-- 024_blog_posts.sql — move blog storage from MDX files (content/posts/*.mdx)
-- into the database so posts survive a deploy (the editor/generator write to
-- disk on the running box, and a deploy wipes uncommitted disk writes).
--
-- blog_posts holds one row per post: the MDX body (stored as text, compiled at
-- render as before) plus every field the MDX frontmatter carried. RLS is on
-- with ZERO policies (default-deny, the house pattern) — all access is
-- server-side via the service-role key, which bypasses RLS. Never add a
-- permissive policy (it would expose posts, incl. drafts + editor notes, to
-- the anon key shipped in the public site's JS).

create table if not exists blog_posts (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  title                 text not null,
  status                text not null default 'draft' check (status in ('draft','published','archived')),
  body_mdx              text not null,
  excerpt               text,
  meta_title            text,
  meta_description      text,
  update_notice         text,
  editor_note           text,
  cta                   text,
  author                text,
  tags                  text[],
  related               text[],
  previous_slugs        text[],
  faq                   jsonb,
  featured              boolean not null default false,
  cover_image           text,
  published_at          date,          -- frontmatter.date (display/publish date)
  updated_at            date,          -- frontmatter.updatedAt (public "Updated" date)
  review_by             date,          -- internal review-due date
  archived_at           date,
  archived_reason       text,
  archive_redirect_slug text,
  humanized_at          timestamptz,   -- Phrasly provenance
  created_at            timestamptz not null default now()
);

create index if not exists blog_posts_status_idx on blog_posts (status, published_at desc);
create index if not exists blog_posts_featured_idx on blog_posts (featured) where featured;

alter table blog_posts enable row level security;

-- Reshape blog_post_revisions: slug-keyed → post_id-keyed (FK → blog_posts.id,
-- so a slug rename no longer needs to re-key history). The table is empty, so
-- drop + recreate cleanly. Columns otherwise unchanged (the editor restore
-- reads frontmatter + body), with post_id replacing slug.
drop table if exists blog_post_revisions;

create table blog_post_revisions (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references blog_posts(id) on delete cascade,
  event            text not null default 'save',
  title            text,
  meta_title       text,
  meta_description text,
  body             text not null,
  frontmatter      jsonb not null default '{}'::jsonb,
  change_summary   text,
  saved_by         text,
  saved_at         timestamptz not null default now()
);

create index blog_post_revisions_post_idx on blog_post_revisions (post_id, saved_at desc);

alter table blog_post_revisions enable row level security;
