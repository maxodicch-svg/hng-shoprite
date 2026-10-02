-- ============================================================================
--  Zedu Store — Supabase schema (HNG15 Lesson 2, Task 1)
--  Run this in: Supabase Dashboard → SQL Editor → New query → Run
--  Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles ---
-- One row per authenticated user (Google sign-in). Written by the client.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- products --
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  currency    text not null default 'USD',
  image_url   text not null default '',
  badge       text,
  in_stock    boolean not null default true,
  stock       integer not null default 25 check (stock >= 0),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------- orders --
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  user_id           uuid references auth.users (id) on delete set null,
  customer_name     text not null,
  customer_email    text not null,
  shipping_address  text not null,
  note              text,
  subtotal_cents    integer not null check (subtotal_cents >= 0),
  shipping_cents    integer not null default 0 check (shipping_cents >= 0),
  total_cents       integer not null check (total_cents >= 0),
  currency          text not null default 'USD',
  status            text not null default 'paid'
                    check (status in ('pending', 'paid', 'shipped', 'cancelled')),
  email_status      text not null default 'pending'
                    check (email_status in ('pending', 'sent', 'failed', 'skipped')),
  email_error       text,
  email_sent_at     timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists orders_user_id_idx    on public.orders (user_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

-- -------------------------------------------------------------- order_items --
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  product_name   text not null,
  product_slug   text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity       integer not null check (quantity > 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------- RLS --
alter table public.profiles    enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Catalog is public read-only.
drop policy if exists "products are public" on public.products;
create policy "products are public" on public.products
  for select using (true);

-- A signed-in user manages their own profile row.
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Orders are written by the server (service role key, which bypasses RLS).
-- These policies are the safety net for direct client access.
drop policy if exists "orders readable by owner" on public.orders;
create policy "orders readable by owner" on public.orders
  for select using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "orders insertable" on public.orders;
create policy "orders insertable" on public.orders
  for insert with check (true);

drop policy if exists "order items readable by owner" on public.order_items;
create policy "order items readable by owner" on public.order_items
  for select using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

drop policy if exists "order items insertable" on public.order_items;
create policy "order items insertable" on public.order_items
  for insert with check (true);

-- --------------------------------------------------------------- seed data --
insert into public.products (slug, name, description, price_cents, badge, image_url, stock)
values
  ('aura-desk-lamp', 'Aura Desk Lamp',
   'Warm-to-cool dimmable LED lamp with a weighted aluminium base and a 40,000-hour lifespan.',
   8900, 'Best seller', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=70', 24),
  ('meridian-headphones', 'Meridian Headphones',
   'Closed-back over-ears with active noise cancelling, 45-hour battery and USB-C fast charge.',
   24900, 'New', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=70', 12),
  ('field-notes-journal', 'Field Notes Journal',
   'A5 dotted notebook, 160gsm bleed-proof paper, lay-flat binding and an elastic closure.',
   2400, null, 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=900&q=70', 60),
  ('orbit-mechanical-keyboard', 'Orbit Mechanical Keyboard',
   '75% hot-swappable board, gasket mount, PBT keycaps and per-key RGB you can actually turn off.',
   17900, 'Low stock', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=70', 7),
  ('terra-ceramic-mug', 'Terra Ceramic Mug',
   'Stoneware mug with a reactive glaze, 350ml, dishwasher and microwave safe.',
   1900, null, 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=70', 80),
  ('nomad-weekender-bag', 'Nomad Weekender',
   'Water-resistant waxed canvas and full-grain leather trim, with a padded 16" laptop sleeve.',
   19900, null, 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=70', 15)
on conflict (slug) do nothing;

-- ------------------------------------------------------------------ verify ---
-- select count(*) as products from public.products;
