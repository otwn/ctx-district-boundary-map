create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.districts (
  id text primary key,
  name text not null unique,
  color text not null default '#FFD700',
  geometry jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.boundary_edits (
  id uuid primary key default gen_random_uuid(),
  district_id text not null references public.districts(id) on delete cascade,
  district_name text,
  edited_by uuid references auth.users(id) on delete set null,
  edited_by_email text,
  old_geometry jsonb,
  new_geometry jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_boundary_edit_email()
returns trigger
language plpgsql
security definer
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

alter table public.user_roles enable row level security;
alter table public.districts enable row level security;
alter table public.boundary_edits enable row level security;

create or replace function public.current_role()
returns text
language sql
stable
as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'viewer');
$$;

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
