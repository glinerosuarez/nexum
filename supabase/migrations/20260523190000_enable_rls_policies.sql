-- Enable Row Level Security on all public tables and grant authenticated
-- users read access. Anonymous traffic (the publishable key) cannot read.
--
-- Single-tenant prototype: every authenticated user in the company sees
-- every project. Granular per-project policies can be added later by
-- combining auth.uid() with public.project_memberships.

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
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'drop policy if exists "authenticated_can_read_%I" on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create policy "authenticated_can_read_%I" on public.%I for select to authenticated using (true)',
      table_name,
      table_name
    );
  end loop;
end
$$;

alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.manage_critical_supply_alert()
  set search_path = public, pg_temp;

alter function public.set_purchase_order_item_priority()
  set search_path = public, pg_temp;

revoke execute on function public.handle_new_user_profile()
  from anon, authenticated;
