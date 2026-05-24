-- Open write access for project_memberships in hackathon demo mode.
-- Needed so onboarding can auto-assign users to new projects before
-- invoking the external supply cost agent.

drop policy if exists "public_can_insert_project_memberships" on public.project_memberships;
create policy "public_can_insert_project_memberships"
  on public.project_memberships
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_project_memberships" on public.project_memberships;
create policy "public_can_update_project_memberships"
  on public.project_memberships
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_delete_project_memberships" on public.project_memberships;
create policy "public_can_delete_project_memberships"
  on public.project_memberships
  for delete
  to public
  using (true);
