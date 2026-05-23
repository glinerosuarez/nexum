-- Open write access (INSERT / UPDATE / DELETE) on projects and
-- project_phases for the hackathon demo, so the "Nuevo proyecto"
-- flow works without auth.

do $$
declare
  table_names text[] := array['projects', 'project_phases'];
  t text;
begin
  foreach t in array table_names loop
    execute format('drop policy if exists "public_can_insert_%I" on public.%I', t, t);
    execute format('drop policy if exists "public_can_update_%I" on public.%I', t, t);
    execute format('drop policy if exists "public_can_delete_%I" on public.%I', t, t);

    execute format(
      'create policy "public_can_insert_%I" on public.%I for insert to public with check (true)',
      t, t
    );
    execute format(
      'create policy "public_can_update_%I" on public.%I for update to public using (true) with check (true)',
      t, t
    );
    execute format(
      'create policy "public_can_delete_%I" on public.%I for delete to public using (true)',
      t, t
    );
  end loop;
end
$$;
