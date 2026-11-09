-- 023_blog_revisions.sql — revision history for blog posts.
--
-- Context: blog POSTS are NOT database rows. They are MDX files in
-- content/posts/, and all lifecycle state lives in frontmatter:
--   status: "draft" | "published" | "archived"   (absent = published, legacy)
--   updatedAt, archivedAt, archivedReason, archiveRedirectSlug,
--   editorNote (internal, never rendered), updateNotice (public banner),
--   metaTitle, reviewBy, previousSlugs[] (301 sources after a slug change)
-- So there is no "posts table" to alter; this migration adds the one thing
-- that genuinely belongs in the database — the append-only revision log the
-- editor writes on every save of a published post and on every publish /
-- unpublish / archive / restore event (drafts are logged on publish only).
--
-- `slug` is the post's identity (the MDX filename). After a slug rename the
-- editor writes a 'slug_change' revision under the NEW slug with the old one
-- in change_summary, so history follows the post.
--
-- RLS: enabled with ZERO policies — default-deny, the house pattern for all
-- tables in this project (see CLAUDE-da-marketing-os.md "Supabase schema").
-- Writes and reads go exclusively through server-side admin routes using the
-- service-role key (which bypasses RLS). Do NOT add a permissive policy: it
-- would expose the table to the anon key shipped in the public site's JS.

create table if not exists blog_post_revisions (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null,
  -- 'publish' | 'save' | 'unpublish' | 'archive' | 'restore' | 'slug_change'
  event            text not null default 'save',
  title            text,
  meta_title       text,
  meta_description text,
  body             text not null,
  -- Full frontmatter snapshot at save time, so Restore reproduces the post
  -- exactly (tags, faq, related, featured, notices — everything).
  frontmatter      jsonb not null default '{}'::jsonb,
  change_summary   text,
  saved_by         text,
  saved_at         timestamptz not null default now()
);

create index if not exists blog_post_revisions_slug_idx
  on blog_post_revisions (slug, saved_at desc);

alter table blog_post_revisions enable row level security;

comment on table blog_post_revisions is
  'Append-only revision log for MDX blog posts (content/posts/). Service-role access only (RLS default-deny).';
