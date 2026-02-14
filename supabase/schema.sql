create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.districts (
  id text primary key,
  name text not null unique,
  color text not null default '#FFD700',
  chapter_name text,
  geometry jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.districts add column if not exists is_active boolean not null default true;
alter table public.districts add column if not exists deleted_at timestamptz;
alter table public.districts add column if not exists deleted_by uuid references auth.users(id) on delete set null;
alter table public.districts add column if not exists chapter_name text;

create index if not exists idx_districts_active on public.districts(is_active);

create table if not exists public.boundary_edits (
  id uuid primary key default gen_random_uuid(),
  district_id text not null references public.districts(id) on delete cascade,
  district_name text,
  edited_by uuid references auth.users(id) on delete set null,
  edited_by_email text,
  old_geometry jsonb,
  new_geometry jsonb,
  action text not null default 'update',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.boundary_edits add column if not exists action text not null default 'update';
alter table public.boundary_edits add column if not exists meta jsonb not null default '{}'::jsonb;
alter table public.boundary_edits alter column new_geometry drop not null;

alter table public.boundary_edits drop constraint if exists boundary_edits_action_check;
alter table public.boundary_edits
add constraint boundary_edits_action_check
check (action in ('insert', 'update', 'soft_delete', 'restore'));

create or replace function public.set_boundary_edit_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.edited_by is not null and new.edited_by_email is null then
    select email into new.edited_by_email from auth.users where id = new.edited_by;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_boundary_edit_email on public.boundary_edits;
create trigger trg_boundary_edit_email
before insert on public.boundary_edits
for each row
execute function public.set_boundary_edit_email();

create or replace function public.current_role()
returns text
language sql
stable
as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'viewer');
$$;

create or replace function public.clean_district_geometry(p_geometry jsonb, p_district_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  candidate geometry;
  neighbors geometry;
  overlap_count integer;
begin
  if p_geometry is null then
    raise exception 'Geometry is required.';
  end if;

  candidate := st_setsrid(st_geomfromgeojson(p_geometry::text), 4326);
  if candidate is null then
    raise exception 'Invalid GeoJSON geometry.';
  end if;

  candidate := st_makevalid(candidate);
  candidate := st_collectionextract(candidate, 3);
  candidate := st_unaryunion(candidate);
  candidate := st_snaptogrid(candidate, 0.000001);

  if st_isempty(candidate) then
    raise exception 'Geometry must contain at least one polygon.';
  end if;

  -- Snap candidate to neighbor edges to reduce slivers and dirty shared boundaries.
  select st_unaryunion(st_collect(st_setsrid(st_geomfromgeojson(d.geometry::text), 4326)))
  into neighbors
  from public.districts d
  where d.is_active = true
    and (p_district_id is null or d.id <> p_district_id);

  if neighbors is not null then
    candidate := st_snap(candidate, neighbors, 0.00005);
    candidate := st_makevalid(candidate);
    candidate := st_collectionextract(candidate, 3);
    candidate := st_unaryunion(candidate);
  end if;

  select count(*)
  into overlap_count
  from public.districts d
  where d.is_active = true
    and (p_district_id is null or d.id <> p_district_id)
    and st_intersects(candidate, st_setsrid(st_geomfromgeojson(d.geometry::text), 4326))
    and st_area(
      st_intersection(candidate, st_setsrid(st_geomfromgeojson(d.geometry::text), 4326))::geography
    ) > 10;

  if overlap_count > 0 then
    raise exception 'Geometry overlaps neighboring district(s).';
  end if;

  return st_asgeojson(candidate)::jsonb;
end;
$$;

create or replace function public.apply_district_operation(
  p_action text,
  p_district_id text,
  p_name text,
  p_geometry jsonb,
  p_color text default '#FFD700',
  p_chapter_name text default null
)
returns table (district_id text, district_name text, action text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing public.districts%rowtype;
  caller_role text;
  cleaned_geometry jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  caller_role := public.current_role();

  if p_action not in ('insert', 'update', 'soft_delete', 'restore') then
    raise exception 'Unsupported action: %', p_action;
  end if;

  if p_action in ('insert', 'soft_delete', 'restore') and caller_role <> 'admin' then
    raise exception 'Only admins can % districts.', p_action;
  end if;

  if p_action = 'update' and caller_role not in ('editor', 'admin') then
    raise exception 'Only editors/admins can update boundaries.';
  end if;

  if p_action = 'insert' then
    if coalesce(trim(p_district_id), '') = '' or coalesce(trim(p_name), '') = '' then
      raise exception 'District id and name are required for insert.';
    end if;

    if exists(select 1 from public.districts where id = p_district_id and is_active = true) then
      raise exception 'District id % already exists.', p_district_id;
    end if;

    cleaned_geometry := public.clean_district_geometry(p_geometry, null);

    insert into public.districts (id, name, color, geometry, is_active, deleted_at, deleted_by)
    values (p_district_id, p_name, coalesce(p_color, '#FFD700'), cleaned_geometry, true, null, null)
    on conflict (id)
    do update set
      name = excluded.name,
      color = excluded.color,
      geometry = excluded.geometry,
      is_active = true,
      deleted_at = null,
      deleted_by = null,
      updated_at = now();

    insert into public.boundary_edits (
      district_id, district_name, edited_by, old_geometry, new_geometry, action, meta
    )
    values (
      p_district_id, p_name, auth.uid(), null, cleaned_geometry, 'insert',
      jsonb_build_object('note', 'Admin created district')
    );

    return query select p_district_id, p_name, 'insert'::text;
    return;
  end if;

  select * into existing
  from public.districts
  where id = p_district_id
  for update;

  if not found then
    raise exception 'District % not found.', p_district_id;
  end if;

  if p_action = 'update' then
    if existing.is_active is not true then
      raise exception 'District % is archived and cannot be edited.', p_district_id;
    end if;

    cleaned_geometry := public.clean_district_geometry(
      coalesce(p_geometry, existing.geometry), p_district_id
    );

    update public.districts
    set
      geometry = cleaned_geometry,
      updated_at = now(),
      name = coalesce(nullif(trim(p_name), ''), existing.name),
      color = coalesce(p_color, existing.color),
      chapter_name = coalesce(nullif(trim(p_chapter_name), ''), existing.chapter_name)
    where id = p_district_id;

    insert into public.boundary_edits (
      district_id, district_name, edited_by, old_geometry, new_geometry, action, meta
    )
    values (
      p_district_id,
      coalesce(nullif(trim(p_name), ''), existing.name),
      auth.uid(),
      existing.geometry,
      cleaned_geometry,
      'update',
      jsonb_build_object('note', 'Boundary update')
    );

    return query select p_district_id, coalesce(nullif(trim(p_name), ''), existing.name), 'update'::text;
    return;
  end if;

  if p_action = 'soft_delete' then
    if existing.is_active is not true then
      raise exception 'District % is already archived.', p_district_id;
    end if;

    update public.districts
    set
      is_active = false,
      deleted_at = now(),
      deleted_by = auth.uid(),
      updated_at = now()
    where id = p_district_id;

    insert into public.boundary_edits (
      district_id, district_name, edited_by, old_geometry, new_geometry, action, meta
    )
    values (
      p_district_id,
      existing.name,
      auth.uid(),
      existing.geometry,
      null,
      'soft_delete',
      jsonb_build_object('note', 'Admin archived district')
    );

    return query select p_district_id, existing.name, 'soft_delete'::text;
    return;
  end if;

  if p_action = 'restore' then
    if existing.is_active is true then
      raise exception 'District % is already active.', p_district_id;
    end if;

    cleaned_geometry := public.clean_district_geometry(coalesce(p_geometry, existing.geometry), p_district_id);

    update public.districts
    set
      is_active = true,
      deleted_at = null,
      deleted_by = null,
      geometry = cleaned_geometry,
      updated_at = now()
    where id = p_district_id;

    insert into public.boundary_edits (
      district_id, district_name, edited_by, old_geometry, new_geometry, action, meta
    )
    values (
      p_district_id,
      existing.name,
      auth.uid(),
      existing.geometry,
      cleaned_geometry,
      'restore',
      jsonb_build_object('note', 'Admin restored district')
    );

    return query select p_district_id, existing.name, 'restore'::text;
    return;
  end if;
end;
$$;

alter table public.user_roles enable row level security;
alter table public.districts enable row level security;
alter table public.boundary_edits enable row level security;

drop policy if exists "roles readable" on public.user_roles;
create policy "roles readable"
on public.user_roles
for select
using (auth.uid() is not null);

drop policy if exists "districts readable" on public.districts;
create policy "districts readable"
on public.districts
for select
using (true);

drop policy if exists "districts editable by editors" on public.districts;
create policy "districts editable by editors"
on public.districts
for update
using (public.current_role() in ('editor', 'admin'))
with check (public.current_role() in ('editor', 'admin'));

drop policy if exists "districts insert by admins" on public.districts;
create policy "districts insert by admins"
on public.districts
for insert
with check (public.current_role() = 'admin');

drop policy if exists "edits readable" on public.boundary_edits;
create policy "edits readable"
on public.boundary_edits
for select
using (true);

drop policy if exists "edits created by editors" on public.boundary_edits;
create policy "edits created by editors"
on public.boundary_edits
for insert
with check (public.current_role() in ('editor', 'admin'));
