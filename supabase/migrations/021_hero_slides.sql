-- 021_hero_slides.sql — homepage hero slider slides, managed from /admin.
-- Apply to the da-marketing-os Supabase project (huqohncglbshwuzeguvb).
--
-- The homepage reads ACTIVE slides server-side (cached 60s via unstable_cache,
-- tag 'hero-slides' revalidated on every admin write) and renders them in the
-- HeroSlider component. Writes go exclusively through the admin APIs
-- (/api/hero-slides*, gated on the da_admin_auth cookie) using the
-- service-role client, which bypasses RLS — matching every other admin table.
--
-- RLS: public (anon) may read ACTIVE rows only; no insert/update/delete
-- policies exist, so writes are service-role only. The max-4-active rule is
-- enforced in the admin API (app level), consistent with how this app guards
-- its other invariants.

create table if not exists hero_slides (
  id          uuid primary key default gen_random_uuid(),
  sort_order  integer not null default 0,
  title       text not null check (char_length(title) <= 60),
  description text not null check (char_length(description) <= 200),
  image_path  text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists hero_slides_active_order_idx
  on hero_slides (is_active, sort_order);

alter table hero_slides enable row level security;

-- Public read of active slides only (service role bypasses RLS for admin).
create policy hero_slides_public_read_active on hero_slides
  for select using (is_active = true);

-- Seed: the two addendum examples already shipped in public/images/hero/.
-- Slots 3 and 4 stay empty — added later from the admin "Hero Slides" tab.
insert into hero_slides (sort_order, title, description, image_path, is_active) values
  (0, 'Required products, one price',
   'Doc fees, filing fees and pre-delivery charges added to MSRP, with the price as equipped shown on the sticker.',
   '/images/hero/addendum-required.webp', true),
  (1, 'Suggested products, clearly optional',
   'Protection packages and add-ons presented in their own section so the buyer knows they''re optional.',
   '/images/hero/addendum-suggested.webp', true);
