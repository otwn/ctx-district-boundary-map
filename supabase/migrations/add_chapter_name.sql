-- Add chapter_name column to districts table
alter table public.districts add column if not exists chapter_name text;
