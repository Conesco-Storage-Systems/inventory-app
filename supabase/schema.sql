-- Conesco Inventory App — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Mirrors the local Dexie tables in src/models/types.ts.

create table projects (
  id text primary key,
  name text not null,
  active boolean not null default true,
  deleted_at bigint,
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

create table sites (
  id text primary key,
  name text not null,
  address text not null default '',
  other_info text not null default '',
  active boolean not null default true,
  deleted_at bigint,
  project_id text references projects(id) on delete set null,
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
  item_description text not null default '',
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

-- Generated shipping documents tied to a location. Line items are picked
-- from that location's own tracked inventory at the time the BOL is made,
-- but this table is a standalone document snapshot — it does not touch
-- inventory quantities.
create table bills_of_lading (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  direction text not null,
  date text not null default '',
  load_number text not null default '',
  reference_doc text not null default '',
  payment_term text not null default '',
  ship_from_company text not null default '',
  ship_from_address text not null default '',
  ship_from_phone text not null default '',
  ship_to_company text not null default '',
  ship_to_contact text not null default '',
  ship_to_address text not null default '',
  ship_to_phone text not null default '',
  carrier text not null default '',
  driver_phone text not null default '',
  broker_info text not null default '',
  line_items jsonb not null default '[]',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

-- Customer-facing spec sheets built from selected inventory items. Only
-- the fields/photos the user chose to include are baked into line_items
-- (photos as data URIs) — a frozen snapshot, same as Bills of Lading.
create table customer_sheets (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  date text not null default '',
  customer_name text not null default '',
  customer_company text not null default '',
  customer_address text not null default '',
  customer_phone text not null default '',
  prepared_by text not null default '',
  line_items jsonb not null default '[]',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

-- Row Level Security: must be logged in to read or write anything.
-- Everyone who's logged in shares full access — this is a shared company
-- inventory system, not a multi-tenant app with per-user data.
alter table projects enable row level security;
alter table sites enable row level security;
alter table beams enable row level security;
alter table uprights enable row level security;
alter table wire_decks enable row level security;
alter table misc_items enable row level security;
alter table photos enable row level security;
alter table project_photos enable row level security;
alter table bills_of_lading enable row level security;
alter table customer_sheets enable row level security;

create policy "Authenticated users can do anything" on projects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
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
create policy "Authenticated users can do anything" on bills_of_lading
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on customer_sheets
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

-- Migration: adds the "Other" item type's Item Description field.
alter table misc_items add column if not exists item_description text not null default '';

-- Migration: adds soft-delete support ("Recently Deleted", 60-day retention).
alter table sites add column if not exists deleted_at bigint;

-- Migration: roles & permissions.
-- One row per authenticated user, holding their role (admin,
-- inventoryManager, sales, or viewer — see src/auth/roles.ts). The existing
-- inventory tables stay open to "any authenticated user" for now — role
-- enforcement starts at the UI layer; tightening table-level RLS by role is
-- a later step once the roles below have been tried out for real.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null default 'viewer',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Anyone logged in can see every profile (needed for an eventual "manage
-- users" screen); only an admin can actually change a role.
create policy "Authenticated users can view all profiles"
  on profiles for select
  using (auth.uid() is not null);

create policy "Only admins can change roles"
  on profiles for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- New sign-ups automatically get a profile row. Defaults to 'viewer' — the
-- safe, no-access-until-promoted default for anyone added going forward.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time backfill for accounts that already existed before this feature
-- shipped. They default to admin — preserving the full access everyone
-- already had — rather than viewer, which only applies to brand-new
-- sign-ups from here on.
insert into public.profiles (id, email, role)
select id, email, 'admin' from auth.users
where id not in (select id from public.profiles)
on conflict (id) do nothing;

-- Migration: Projects — folders for bigger customer jobs (e.g. Automann)
-- that contain multiple locations. Their material is excluded from "All
-- Offsite Inventory" since it belongs to the customer, not Conesco's own
-- sellable stock.
create table if not exists projects (
  id text primary key,
  name text not null,
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

alter table projects add column if not exists active boolean not null default true;
alter table projects add column if not exists deleted_at bigint;

alter table projects enable row level security;

create policy "Authenticated users can do anything" on projects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

alter table sites add column if not exists project_id text references projects(id) on delete set null;

-- Migration: Bills of Lading — generated shipping documents tied to a
-- location. Line items are picked from that location's own tracked
-- inventory at the time the BOL is made, but this table is a standalone
-- document snapshot — it does not touch inventory quantities.
create table if not exists bills_of_lading (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  direction text not null,
  date text not null default '',
  load_number text not null default '',
  reference_doc text not null default '',
  payment_term text not null default '',
  ship_from_company text not null default '',
  ship_from_address text not null default '',
  ship_from_phone text not null default '',
  ship_to_company text not null default '',
  ship_to_contact text not null default '',
  ship_to_address text not null default '',
  ship_to_phone text not null default '',
  carrier text not null default '',
  driver_phone text not null default '',
  broker_info text not null default '',
  line_items jsonb not null default '[]',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

alter table bills_of_lading enable row level security;

create policy "Authenticated users can do anything" on bills_of_lading
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: Customer Sheets — customer-facing spec sheets built from
-- selected inventory items. Only the fields/photos the user chose to
-- include are baked into line_items (photos as data URIs) — a frozen
-- snapshot, same as Bills of Lading, so it never depends on the source
-- items still existing.
create table if not exists customer_sheets (
  id text primary key,
  site_id text not null references sites(id) on delete cascade,
  date text not null default '',
  customer_name text not null default '',
  customer_company text not null default '',
  customer_address text not null default '',
  customer_phone text not null default '',
  prepared_by text not null default '',
  line_items jsonb not null default '[]',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

alter table customer_sheets enable row level security;

create policy "Authenticated users can do anything" on customer_sheets
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
