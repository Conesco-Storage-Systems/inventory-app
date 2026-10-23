-- Conesco Inventory App — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Mirrors the local Dexie tables in src/models/types.ts.

create table projects (
  id text primary key,
  name text not null,
  active boolean not null default true,
  deleted_at bigint,
  owner_id uuid references auth.users(id) on delete set null,
  owner_email text not null default '',
  shared_with jsonb not null default '[]',
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
  length text not null default '',
  width text not null default '',
  color text not null default '',
  pin_count text not null default '',
  stamp text not null default '',
  style text not null default '',
  stickers text not null default '',
  step text not null default '',
  cost_per numeric not null default 0,
  sell_per numeric not null default 0,
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
  width text not null default '',
  height text not null default '',
  column_length text not null default '',
  column_width text not null default '',
  footplate_length text not null default '',
  footplate_width text not null default '',
  footplate_thickness text not null default '',
  anchor_hole_count text not null default '',
  hole_size text not null default '',
  gauge text not null default '',
  stamp text not null default '',
  cost_per numeric not null default 0,
  sell_per numeric not null default 0,
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
  cost_per numeric not null default 0,
  sell_per numeric not null default 0,
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
  cost_per numeric not null default 0,
  sell_per numeric not null default 0,
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
  trailer_loaded_by text not null default '',
  freight_counted_by text not null default '',
  shipper_signature_image text not null default '',
  shipper_signed_at bigint not null default 0,
  carrier_signature_image text not null default '',
  carrier_signed_at bigint not null default 0,
  shipped_at bigint not null default 0,
  line_items jsonb not null default '[]',
  source_so_numbers jsonb not null default '[]',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null
);

-- Real-time photos of the actual shipment, taken on the BOL screen once
-- it's ready to go (or already shipped) — a record of what was physically
-- on the truck, separate from the line items themselves.
create table bol_photos (
  id text primary key,
  bol_id text not null references bills_of_lading(id) on delete cascade,
  storage_path text not null,
  created_at bigint not null
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

-- Sales Order line items, tracked on the Director of Procurement's
-- Procurement page. Imported from a SalesPad Excel export as 'pending',
-- then tied to exactly one inventory row at one location — that sets
-- tied_site_id and deducts the quantity, moving the line item onto that
-- location's own Sales Order list.
create table sales_order_line_items (
  id text primary key,
  so_number text not null default '',
  description text not null default '',
  warehouse_code text not null default '',
  quantity_ordered numeric not null default 0,
  status text not null default 'pending',
  tied_site_id text references sites(id) on delete set null,
  tied_site_name text not null default '',
  tied_item_type text not null default '',
  tied_item_ids jsonb not null default '[]',
  tied_description text not null default '',
  tied_at bigint not null default 0,
  tied_by text not null default '',
  flagged_duplicate boolean not null default false,
  imported_at bigint not null,
  created_at bigint not null,
  updated_at bigint not null
);

-- One (Sales Order #, location) pair's planned ship date, set from the
-- "Schedule Shipment" button on that Sales Order's page — independent of
-- any Bill of Lading. Unique per (so_number, site_id): scheduling again
-- for the same pair updates this row instead of creating another one.
create table sales_order_schedules (
  id text primary key,
  so_number text not null default '',
  site_id text references sites(id) on delete set null,
  site_name text not null default '',
  scheduled_ship_date text not null default '',
  created_by text not null default '',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null,
  unique (so_number, site_id)
);

-- A Sales Quote a sales person is building for a customer. Holding
-- inventory against it never touches the item's own quantity — "available"
-- is always quantity minus active holds — so canceling a quote (or one of
-- its line items) is just deleting a row, nothing to reconcile.
create table sales_quotes (
  id text primary key,
  quote_number text not null default '',
  customer_name text not null default '',
  customer_address text not null default '',
  notes text not null default '',
  created_by_id uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  canceled_at bigint,
  created_at bigint not null,
  last_updated_at bigint not null
);

-- One held inventory group on a quote. A row here only ever exists while
-- its hold is active — canceling it deletes the row outright.
create table sales_quote_line_items (
  id text primary key,
  quote_id text not null references sales_quotes(id) on delete cascade,
  quote_number text not null default '',
  site_id text references sites(id) on delete set null,
  site_name text not null default '',
  item_type text not null default '',
  item_ids jsonb not null default '[]',
  description text not null default '',
  quantity_held numeric not null default 0,
  held_by_email text not null default '',
  created_at bigint not null
);

-- Tombstones: a lightweight record of "this row was deleted" for every
-- table that uses a real delete rather than a soft deletedAt flag (sites
-- and projects already soft-delete and don't need this). Without this, a
-- device that already pulled a row has no way to ever learn it was
-- deleted elsewhere — pulls only ever discover new/changed rows, never
-- removed ones.
create table tombstones (
  id text primary key,
  table_name text not null,
  record_id text not null,
  deleted_at bigint not null
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
alter table bol_photos enable row level security;
alter table bills_of_lading enable row level security;
alter table customer_sheets enable row level security;
alter table sales_order_line_items enable row level security;
alter table sales_order_schedules enable row level security;
alter table sales_quotes enable row level security;
alter table sales_quote_line_items enable row level security;
alter table tombstones enable row level security;

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
create policy "Authenticated users can do anything" on bol_photos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on bills_of_lading
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on customer_sheets
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on sales_order_line_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on sales_order_schedules
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on sales_quotes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on sales_quote_line_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on tombstones
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Storage bucket policy: creating the "inventory-photos" bucket in the
-- dashboard does NOT automatically let logged-in users upload to it — that's
-- a separate policy on storage.objects, scoped to just this bucket.
create policy "Authenticated users can do anything with inventory photos"
  on storage.objects for all
  using (bucket_id = 'inventory-photos' and auth.uid() is not null)
  with check (bucket_id = 'inventory-photos' and auth.uid() is not null);

-- Guards every "last write wins" table against being pushed in reverse.
-- The app's own conflict logic only ever applies when PULLING (an
-- incoming remote row is compared against a pending local one) — nothing
-- stopped a push from blindly overwriting a newer server row with an
-- older one. That's exactly how a years-dormant device's bad local
-- migration output won over good, already-synced data. This rejects any
-- incoming write whose own timestamp isn't actually newer than what's
-- already stored, regardless of which device or code path sends it.
create or replace function reject_stale_update_at() returns trigger as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function reject_stale_last_update_at() returns trigger as $$
begin
  if new.last_updated_at <= old.last_updated_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger beams_reject_stale_update before update on beams
  for each row execute function reject_stale_update_at();
create trigger uprights_reject_stale_update before update on uprights
  for each row execute function reject_stale_update_at();
create trigger wire_decks_reject_stale_update before update on wire_decks
  for each row execute function reject_stale_update_at();
create trigger misc_items_reject_stale_update before update on misc_items
  for each row execute function reject_stale_update_at();
create trigger sales_order_line_items_reject_stale_update before update on sales_order_line_items
  for each row execute function reject_stale_update_at();

create trigger projects_reject_stale_update before update on projects
  for each row execute function reject_stale_last_update_at();
create trigger sites_reject_stale_update before update on sites
  for each row execute function reject_stale_last_update_at();
create trigger bills_of_lading_reject_stale_update before update on bills_of_lading
  for each row execute function reject_stale_last_update_at();
create trigger customer_sheets_reject_stale_update before update on customer_sheets
  for each row execute function reject_stale_last_update_at();
create trigger sales_order_schedules_reject_stale_update before update on sales_order_schedules
  for each row execute function reject_stale_last_update_at();
create trigger sales_quotes_reject_stale_update before update on sales_quotes
  for each row execute function reject_stale_last_update_at();

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
-- inventoryManager, sales, viewer, or directorOfProcurement — see
-- src/auth/roles.ts). The existing
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

-- Migration: Projects become person-specific — only the owner and whoever
-- they've shared it with see it. An empty owner_id means "created before
-- this existed" and stays visible to everyone rather than disappearing.
alter table projects add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table projects add column if not exists owner_email text not null default '';
alter table projects add column if not exists shared_with jsonb not null default '[]';

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
  trailer_loaded_by text not null default '',
  freight_counted_by text not null default '',
  shipper_signature_image text not null default '',
  shipper_signed_at bigint not null default 0,
  carrier_signature_image text not null default '',
  carrier_signed_at bigint not null default 0,
  shipped_at bigint not null default 0,
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

-- Migration: adds Cost Per / Sell Per to every item type, so every item
-- can carry the numbers needed to track margin.
alter table beams add column if not exists cost_per numeric not null default 0;
alter table beams add column if not exists sell_per numeric not null default 0;
alter table uprights add column if not exists cost_per numeric not null default 0;
alter table uprights add column if not exists sell_per numeric not null default 0;
alter table wire_decks add column if not exists cost_per numeric not null default 0;
alter table wire_decks add column if not exists sell_per numeric not null default 0;
alter table misc_items add column if not exists cost_per numeric not null default 0;
alter table misc_items add column if not exists sell_per numeric not null default 0;

-- Migration: Upright height becomes free text (like Beam's width already
-- is), so a cut/repaired upright's height can be a range exactly as
-- written on the sheet (e.g. "8' - 10'" or "19'6" - 20'") instead of one
-- exact number. Existing height_feet/height_inches values are folded into
-- the new column before the old ones are dropped.
alter table uprights add column if not exists height text not null default '';
update uprights
  set height = height_feet::text || ''''
    || (case when height_inches > 0 then ' ' || height_inches::text || '"' else '' end)
  where height = '' and height_feet is not null;
alter table uprights drop column if exists height_feet;
alter table uprights drop column if exists height_inches;

-- Migration: Beam length becomes free text (like width already is), so a
-- cut beam's length can be a range exactly as written on the sheet (e.g.
-- "101.5 - 102") instead of one exact number. Existing numeric values are
-- cast straight to text, no data loss.
alter table beams alter column length type text using length::text;
alter table beams alter column length set default '';

-- Migration: Bills of Lading gets the "Trailer Loaded" and "Freight
-- Counted" checklist fields (By Shipper / By Driver, etc.) so those can be
-- set from the in-app Edit view instead of only existing as unfillable
-- checkboxes on the printed sheet.
alter table bills_of_lading add column if not exists trailer_loaded_by text not null default '';
alter table bills_of_lading add column if not exists freight_counted_by text not null default '';

-- Migration: Bills of Lading gets hand-drawn e-signatures, captured
-- directly on the Shipper/Carrier signature lines. Each can be signed
-- independently (e.g. carrier signs later when the driver arrives), so
-- each gets its own image + signed-at timestamp rather than one shared
-- "shipped at" — a BOL counts as shipped once both are present.
alter table bills_of_lading add column if not exists shipper_signature_image text not null default '';
alter table bills_of_lading add column if not exists shipper_signed_at bigint not null default 0;
alter table bills_of_lading add column if not exists carrier_signature_image text not null default '';
alter table bills_of_lading add column if not exists carrier_signed_at bigint not null default 0;

-- Migration: Bills of Lading gets an explicit "Mark as Shipped" action,
-- separate from just having both signatures — appears once both Shipper
-- and Carrier have signed, and confirms the shipment as an intentional
-- final step.
alter table bills_of_lading add column if not exists shipped_at bigint not null default 0;

-- Migration: Sales Order line items — the Director of Procurement's
-- tracking page. Imported from a SalesPad Excel export (eventually a live
-- API) as 'pending', then tied to exactly one inventory row at one
-- location, which deducts that quantity
-- and moves the line item onto that location's own Sales Order list.
create table if not exists sales_order_line_items (
  id text primary key,
  so_number text not null default '',
  description text not null default '',
  warehouse_code text not null default '',
  quantity_ordered numeric not null default 0,
  status text not null default 'pending',
  tied_site_id text references sites(id) on delete set null,
  tied_site_name text not null default '',
  tied_item_type text not null default '',
  tied_item_ids jsonb not null default '[]',
  tied_description text not null default '',
  tied_at bigint not null default 0,
  tied_by text not null default '',
  flagged_duplicate boolean not null default false,
  imported_at bigint not null,
  created_at bigint not null,
  updated_at bigint not null
);

alter table sales_order_line_items enable row level security;

create policy "Authenticated users can do anything" on sales_order_line_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: Sales Quotes — a sales person builds one for a customer and
-- holds inventory groups against it. Holding never touches the item's own
-- quantity ("available" is always quantity minus active holds), so
-- canceling a quote or one of its line items is just deleting a row.
create table if not exists sales_quotes (
  id text primary key,
  quote_number text not null default '',
  customer_name text not null default '',
  customer_address text not null default '',
  notes text not null default '',
  created_by_id uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  canceled_at bigint,
  created_at bigint not null,
  last_updated_at bigint not null
);

create table if not exists sales_quote_line_items (
  id text primary key,
  quote_id text not null references sales_quotes(id) on delete cascade,
  quote_number text not null default '',
  site_id text references sites(id) on delete set null,
  site_name text not null default '',
  item_type text not null default '',
  item_ids jsonb not null default '[]',
  description text not null default '',
  quantity_held numeric not null default 0,
  held_by_email text not null default '',
  created_at bigint not null
);

alter table sales_quotes enable row level security;
alter table sales_quote_line_items enable row level security;

create policy "Authenticated users can do anything" on sales_quotes
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Authenticated users can do anything" on sales_quote_line_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: Bills of Lading gets a real link back to the Sales Order
-- number(s) it was generated from, so the Sales Orders page can reliably
-- tell whether a given order has shipped — unlike reference_doc, which is
-- just free text a user can edit.
alter table bills_of_lading add column if not exists source_so_numbers jsonb not null default '[]';

-- Migration: Sales Order shipment scheduling — a planned ship date for
-- one (Sales Order #, location) pair, set from the "Schedule Shipment"
-- button on that Sales Order's page, independent of any Bill of Lading.
create table if not exists sales_order_schedules (
  id text primary key,
  so_number text not null default '',
  site_id text references sites(id) on delete set null,
  site_name text not null default '',
  scheduled_ship_date text not null default '',
  created_by text not null default '',
  created_at bigint not null,
  last_updated_by text not null default '',
  last_updated_at bigint not null,
  unique (so_number, site_id)
);

alter table sales_order_schedules enable row level security;

create policy "Authenticated users can do anything" on sales_order_schedules
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: BOL photos — real-time photos of the actual shipment, taken
-- on the BOL screen once it's ready to go (or already shipped), separate
-- from the line items themselves.
create table if not exists bol_photos (
  id text primary key,
  bol_id text not null references bills_of_lading(id) on delete cascade,
  storage_path text not null,
  created_at bigint not null
);

alter table bol_photos enable row level security;

create policy "Authenticated users can do anything" on bol_photos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: tombstones — lets every device learn when a row was deleted
-- elsewhere, not just when something is new or changed (run this in the
-- SQL editor against the already-live database — the create table near
-- the top is only for a brand new setup).
create table if not exists tombstones (
  id text primary key,
  table_name text not null,
  record_id text not null,
  deleted_at bigint not null
);

alter table tombstones enable row level security;

create policy "Authenticated users can do anything" on tombstones
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: reject-stale-update guard (run this in the SQL editor against
-- the already-live database — the create trigger statements near the top
-- are only for a brand new setup). See the comment there for why this
-- exists: a push should never be able to overwrite a newer server row
-- with an older one, no matter which device or code path sends it.
create or replace function reject_stale_update_at() returns trigger as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function reject_stale_last_update_at() returns trigger as $$
begin
  if new.last_updated_at <= old.last_updated_at then
    return old;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists beams_reject_stale_update on beams;
create trigger beams_reject_stale_update before update on beams
  for each row execute function reject_stale_update_at();
drop trigger if exists uprights_reject_stale_update on uprights;
create trigger uprights_reject_stale_update before update on uprights
  for each row execute function reject_stale_update_at();
drop trigger if exists wire_decks_reject_stale_update on wire_decks;
create trigger wire_decks_reject_stale_update before update on wire_decks
  for each row execute function reject_stale_update_at();
drop trigger if exists misc_items_reject_stale_update on misc_items;
create trigger misc_items_reject_stale_update before update on misc_items
  for each row execute function reject_stale_update_at();
drop trigger if exists sales_order_line_items_reject_stale_update on sales_order_line_items;
create trigger sales_order_line_items_reject_stale_update before update on sales_order_line_items
  for each row execute function reject_stale_update_at();

drop trigger if exists projects_reject_stale_update on projects;
create trigger projects_reject_stale_update before update on projects
  for each row execute function reject_stale_last_update_at();
drop trigger if exists sites_reject_stale_update on sites;
create trigger sites_reject_stale_update before update on sites
  for each row execute function reject_stale_last_update_at();
drop trigger if exists bills_of_lading_reject_stale_update on bills_of_lading;
create trigger bills_of_lading_reject_stale_update before update on bills_of_lading
  for each row execute function reject_stale_last_update_at();
drop trigger if exists customer_sheets_reject_stale_update on customer_sheets;
create trigger customer_sheets_reject_stale_update before update on customer_sheets
  for each row execute function reject_stale_last_update_at();
drop trigger if exists sales_order_schedules_reject_stale_update on sales_order_schedules;
create trigger sales_order_schedules_reject_stale_update before update on sales_order_schedules
  for each row execute function reject_stale_last_update_at();
drop trigger if exists sales_quotes_reject_stale_update on sales_quotes;
create trigger sales_quotes_reject_stale_update before update on sales_quotes
  for each row execute function reject_stale_last_update_at();

-- Adds Footplate Thickness to Uprights — a distinct measurement from the
-- existing Footplate Length/Width (e.g. "3/16" or "1/4"), its own field
-- rather than folded into either of them. Run this against the live
-- database (it's just the one new column; the create table above already
-- reflects it for a fresh setup).
alter table uprights add column if not exists footplate_thickness text not null default '';

-- Column Length/Width and Footplate Length/Width on Uprights become free
-- text (same convention as height/footplate_thickness above), so a
-- fraction like "1-5/8" can be entered exactly as written instead of
-- silently being discarded. These columns previously existed as `numeric`
-- — this changes their type in place rather than adding new ones, so run
-- it against the live database (the create table above already reflects
-- the new type for a fresh setup). The `using ... ::text` cast preserves
-- every existing value exactly (e.g. 18 -> '18'), with no data loss.
alter table uprights alter column column_length type text using column_length::text;
alter table uprights alter column column_length set default '';
alter table uprights alter column column_width type text using column_width::text;
alter table uprights alter column column_width set default '';
alter table uprights alter column footplate_length type text using footplate_length::text;
alter table uprights alter column footplate_length set default '';
alter table uprights alter column footplate_width type text using footplate_width::text;
alter table uprights alter column footplate_width set default '';

-- Width and Anchor Hole Count on Uprights become free text too, for the
-- same reason and with the same lossless cast as above.
alter table uprights alter column width type text using width::text;
alter table uprights alter column width set default '';
alter table uprights alter column anchor_hole_count type text using anchor_hole_count::text;
alter table uprights alter column anchor_hole_count set default '';

-- Sales Order line item import no longer silently skips a row whose
-- (so_number, description, warehouse_code, quantity) signature already
-- matches one already in the system — it still gets imported, just
-- flagged, so it shows in its own "Duplicates" section for review instead
-- of being dropped. Run this against the live database (the create table
-- above already reflects it for a fresh setup).
alter table sales_order_line_items add column if not exists flagged_duplicate boolean not null default false;

-- Migration: Inventory Transfers — moves one or more whole inventory groups
-- from one location to another in a single confirmed action, from the
-- "Create Inventory Transfer" link on the Sales Orders page. Each row here
-- is a frozen receipt of a move that already happened (the moved items'
-- own site_id was already updated through the normal item sync) — never
-- edited after creation, same as a Sales Quote line item.
create table if not exists inventory_transfers (
  id text primary key,
  from_site_id text references sites(id) on delete set null,
  from_site_name text not null default '',
  to_site_id text references sites(id) on delete set null,
  to_site_name text not null default '',
  scheduled_date text not null default '',
  line_items jsonb not null default '[]',
  created_by text not null default '',
  created_at bigint not null
);

alter table inventory_transfers enable row level security;

create policy "Authenticated users can do anything" on inventory_transfers
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Migration: Project Management dashboard, Phase 1 — a project-wide list
-- of real offsite Locations to check material needs against.
alter table projects add column if not exists sourcing_site_ids jsonb not null default '[]';

-- Planning destinations within a project's build-out (e.g. "Caledon,
-- Canada" for Automann) — distinct from a real Location: it may not exist
-- as a site, or have any inventory yet, until linked_site_id is set.
create table if not exists project_job_sites (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null default '',
  target_date text not null default '',
  linked_site_id text references sites(id) on delete set null,
  notes text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

alter table project_job_sites enable row level security;

create policy "Authenticated users can do anything" on project_job_sites
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create trigger project_job_sites_reject_stale_update before update on project_job_sites
  for each row execute function reject_stale_update_at();

-- One line of planned material for a project job site, tracked by exact
-- spec (not color/condition) so it can be matched against live on-hand
-- inventory at the project's sourcing_site_ids.
create table if not exists material_needs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  job_site_id text not null references project_job_sites(id) on delete cascade,
  item_type text not null default '',
  quantity_needed numeric not null default 0,
  notes text not null default '',
  -- Every field below mirrors the real Add Item forms (minus photos) so a
  -- Material Need captures everything those forms do for permitting/
  -- engineering purposes. Live sourcing only matches on the dimension
  -- fields (width/length/height/column_length/column_width/description) —
  -- see the comment on MaterialNeed in src/models/types.ts.
  condition text not null default '',
  bundle_size text not null default '',
  zone text not null default '',
  cost_per numeric not null default 0,
  sell_per numeric not null default 0,
  color text not null default '',
  style text not null default '',
  stamp text not null default '',
  length text not null default '',
  width text not null default '',
  pin_count text not null default '',
  stickers text not null default '',
  step text not null default '',
  height text not null default '',
  column_length text not null default '',
  column_width text not null default '',
  footplate_length text not null default '',
  footplate_width text not null default '',
  footplate_thickness text not null default '',
  anchor_hole_count text not null default '',
  hole_size text not null default '',
  gauge text not null default '',
  channel_count text not null default '',
  wire_deck_style jsonb not null default '[]',
  description text not null default '',
  item_description text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

alter table material_needs enable row level security;

create policy "Authenticated users can do anything" on material_needs
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- A tracking record of real, on-hand inventory earmarked toward one
-- Material Need (see src/db/materialNeedAllocations.ts) — does NOT
-- deduct from that inventory; the actual reservation happens later, when
-- it's tied to a Sales Order. Created once and never edited, same as
-- sales_quote_line_items.
create table if not exists material_need_allocations (
  id text primary key,
  material_need_id text not null references material_needs(id) on delete cascade,
  project_id text not null references projects(id) on delete cascade,
  site_id text references sites(id) on delete set null,
  site_name text not null default '',
  item_type text not null default '',
  item_ids jsonb not null default '[]',
  description text not null default '',
  quantity numeric not null default 0,
  tied_at bigint not null,
  tied_by text not null default ''
);

alter table material_need_allocations enable row level security;

create policy "Authenticated users can do anything" on material_need_allocations
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create trigger material_needs_reject_stale_update before update on material_needs
  for each row execute function reject_stale_update_at();

-- Migration: capture the SO report's "Created On" and "Sales Person ID"
-- columns on import (see src/import/parseSoReport.ts) — groundwork for
-- being able to scan a trailing window of orders for changes, not just
-- flag exact-duplicate rows. Run this against the live database.
alter table sales_order_line_items add column if not exists created_on bigint not null default 0;
alter table sales_order_line_items add column if not exists salesperson_id text not null default '';

-- Migration: Bulletin Board — an admin-only joint space for notes, ideas,
-- and plans, with comments and optional photos on each post. Editable
-- like a Material Need (reject_stale_update_at resolves a same-row
-- conflict); comments and photos are create/delete-only, same as
-- Material Need Allocations.
create table if not exists bulletin_posts (
  id text primary key,
  author_email text not null default '',
  body text not null default '',
  created_at bigint not null,
  updated_at bigint not null
);

alter table bulletin_posts enable row level security;

create policy "Authenticated users can do anything" on bulletin_posts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create trigger bulletin_posts_reject_stale_update before update on bulletin_posts
  for each row execute function reject_stale_update_at();

create table if not exists bulletin_comments (
  id text primary key,
  post_id text not null references bulletin_posts(id) on delete cascade,
  author_email text not null default '',
  body text not null default '',
  created_at bigint not null
);

alter table bulletin_comments enable row level security;

create policy "Authenticated users can do anything" on bulletin_comments
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table if not exists bulletin_post_photos (
  id text primary key,
  post_id text not null references bulletin_posts(id) on delete cascade,
  storage_path text not null default '',
  created_at bigint not null
);

alter table bulletin_post_photos enable row level security;

create policy "Authenticated users can do anything" on bulletin_post_photos
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
