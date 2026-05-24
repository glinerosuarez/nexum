-- Open write access for onboarding bootstrap tables in hackathon demo mode.
-- This allows server actions using anon/authenticated sessions to create
-- baseline activities/APU rows right after project creation.

do $$
declare
  table_names text[] := array['activities', 'activity_supplies', 'supply_catalog'];
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
