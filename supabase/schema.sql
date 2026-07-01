-- Books for Romi — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard -> SQL -> New query).
--
-- The app is single-user, so every row is scoped to a fixed profile_id ('romi').
-- Row Level Security is enabled so a leaked anon key can't be used to write junk
-- from another profile. We use permissive policies for the 'romi' profile only.

-- Swipes: like / pass. (Skips are never stored — they have no algorithm effect.)
create table if not exists public.swipes (
  profile_id text not null default 'romi',
  book_key   text not null,
  direction  text not null check (direction in ('like', 'pass')),
  created_at timestamptz not null default now(),
  primary key (profile_id, book_key)
);

-- Saved (bookmarked) books.
create table if not exists public.saved_books (
  profile_id text not null default 'romi',
  book_key   text not null,
  title      text not null,
  author     text not null,
  cover_url  text,
  buy_url    text,
  saved_at   timestamptz not null default now(),
  primary key (profile_id, book_key)
);

-- Learned taste weights (author / genre affinities from swipes).
create table if not exists public.taste_weights (
  profile_id    text not null default 'romi',
  feature_type  text not null check (feature_type in ('author', 'genre')),
  feature_value text not null,
  weight        double precision not null default 0,
  primary key (profile_id, feature_type, feature_value)
);

-- Cached API metadata so saved/passed books survive API outages.
create table if not exists public.book_cache (
  book_key      text primary key,
  metadata_json jsonb not null,
  cover_url     text,
  fetched_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.swipes        enable row level security;
alter table public.saved_books   enable row level security;
alter table public.taste_weights enable row level security;
alter table public.book_cache    enable row level security;

-- Single-profile policies: allow all operations only for the 'romi' profile.
drop policy if exists "romi swipes" on public.swipes;
create policy "romi swipes" on public.swipes
  for all using (profile_id = 'romi') with check (profile_id = 'romi');

drop policy if exists "romi saved" on public.saved_books;
create policy "romi saved" on public.saved_books
  for all using (profile_id = 'romi') with check (profile_id = 'romi');

drop policy if exists "romi weights" on public.taste_weights;
create policy "romi weights" on public.taste_weights
  for all using (profile_id = 'romi') with check (profile_id = 'romi');

drop policy if exists "romi cache" on public.book_cache;
create policy "romi cache" on public.book_cache
  for all using (true) with check (true);
