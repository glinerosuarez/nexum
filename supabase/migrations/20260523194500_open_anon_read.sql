-- Open SELECT access to anon for the hackathon demo (no login required).
-- Replaces the previous "authenticated only" SELECT policies with one
-- per table that applies to public (anon + authenticated).

do $$
declare
  table_name text;
  table_names text[] := array[
    'profiles',
    'projects',
    'project_memberships',
    'project_phases',
    'activities',
    'supply_catalog',
    'supply_availability_alerts',
    'activity_supplies',
    'suppliers',
    'budget_snapshots',
    'budget_snapshot_items',
    'purchase_orders',
    'purchase_order_items',
    'supplier_payments',
    'payroll_periods',
    'payroll_entries',
    'schedule_baselines',
    'schedule_items',
    'progress_logs',
    'incidents',
    'incident_actions',
    'daily_reports',
    'daily_report_items'
  ];
begin
  foreach table_name in array table_names loop
    execute format(
      'drop policy if exists "authenticated_can_read_%I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'drop policy if exists "public_can_read_%I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "public_can_read_%I" on public.%I for select to public using (true)',
      table_name,
      table_name
    );
  end loop;
end
$$;
