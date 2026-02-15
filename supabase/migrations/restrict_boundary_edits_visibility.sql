-- Remove stored editor emails and prevent anonymous reads of edit history.
drop trigger if exists trg_boundary_edit_email on public.boundary_edits;
drop function if exists public.set_boundary_edit_email();

update public.boundary_edits
set edited_by_email = null
where edited_by_email is not null;

drop policy if exists "edits readable" on public.boundary_edits;
create policy "edits readable"
on public.boundary_edits
for select
using (auth.uid() is not null);
