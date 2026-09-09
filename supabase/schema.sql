-- Conesco Inventory App — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Mirrors the local Dexie tables in src/models/types.ts.

create table sites (
  id text primary key,
  name text not null,
  address text not null default '',
  other_info text not null default '',
  active boolean not null default true,
  site_photo_path text,
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

create table beams (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  quantity integer not null default 0,
  condition text not null,
  bundle_size text not null default '',
  zone text not null default '',
  notes text not null default '',
  recorded_by text not null default '',
  length numeric not null default 0,
  width text not null default '',
  color text not null default '',
  pin_count text not null default '',
  stamp text not null default '',
  style text not null default '',
  stickers text not null default '',
  step text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

create table uprights (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  quantity integer not null default 0,
  condition text not null,
  bundle_size text not null default '',
  zone text not null default '',
  notes text not null default '',
  recorded_by text not null default '',
  color text not null default '',
  style text not null default '',
  width numeric not null default 0,
  height_feet numeric not null default 0,
  height_inches numeric not null default 0,
  column_length numeric not null default 0,
  column_width numeric not null default 0,
  footplate_length numeric not null default 0,
  footplate_width numeric not null default 0,
  anchor_hole_count integer not null default 0,
  hole_size text not null default '',
  gauge text not null default '',
  stamp text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

create table wire_decks (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  quantity integer not null default 0,
  condition text not null,
  bundle_size text not null default '',
  zone text not null default '',
  notes text not null default '',
  recorded_by text not null default '',
  length numeric not null default 0,
  width numeric not null default 0,
  channel_count text not null default '',
  style text[] not null default '{}',
  created_at bigint not null,
  updated_at bigint not null
);

-- Not built into the UI yet (the "Other" item type) — schema is ready ahead of that work.
create table misc_items (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  quantity integer not null default 0,
  condition text not null,
  bundle_size text not null default '',
  zone text not null default '',
  notes text not null default '',
  recorded_by text not null default '',
  description text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

create table photos (
  id text primary key,
  item_type text not null,
  item_id text not null,
  storage_path text not null,
  created_at bigint not null
);

create table project_photos (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  storage_path text not null,
  created_at bigint not null
);

-- Row Level Security: must be logged in to read or write anything.
-- Everyone who's logged in shares full access — this is a shared company
-- inventory system, not a multi-tenant app with per-user data.
alter table sites enable row level security;
alter table beams enable row level security;
alter table uprights enable row level security;
alter table wire_decks enable row level security;
alter table misc_items enable row level security;
alter table photos enable row level security;
alter table project_photos enable row level security;

create policy "Authenticated users can do anything" on sites
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on beams
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on uprights
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on wire_decks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on misc_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on photos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on project_photos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Storage bucket policy: creating the "inventory-photos" bucket in the
-- dashboard does NOT automatically let logged-in users upload to it — that's
-- a separate policy on storage.objects, scoped to just this bucket.
create policy "Authenticated users can do anything with inventory photos"
  on storage.objects for all
  using (bucket_id = 'inventory-photos' and auth.uid() is not null)
  with check (bucket_id = 'inventory-photos' and auth.uid() is not null);

-- Migration: adds the Beam "Step" field (run this in the SQL editor against
-- the already-live database — the create table above is only for a brand
-- new setup and won't re-run against an existing table).
alter table beams add column if not exists step text not null default '';
