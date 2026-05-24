-- Ensure dashboard reads persisted MCP run counters even when scalar columns are not populated.
-- Also expose budget impact from run metadata when no overrun alert exists.

update public.supply_agent_runs r
set
  supplies_targeted = coalesce(
    nullif(r.supplies_targeted, 0),
    nullif(r.metadata -> 'counters' ->> 'supplies_requested', '')::integer,
    0
  ),
  supplies_scraped_ok = coalesce(
    nullif(r.supplies_scraped_ok, 0),
    nullif(r.metadata -> 'counters' ->> 'supplies_processed', '')::integer,
    0
  ),
  supplies_scraped_failed = coalesce(
    nullif(r.supplies_scraped_failed, 0),
    nullif(r.metadata -> 'counters' ->> 'errors', '')::integer,
    0
  ),
  forecast_points_written = coalesce(
    nullif(r.forecast_points_written, 0),
    nullif(r.metadata -> 'counters' ->> 'forecasts_written', '')::integer,
    0
  ),
  alerts_triggered = coalesce(
    nullif(r.alerts_triggered, 0),
    nullif(r.metadata -> 'counters' ->> 'alerts_created', '')::integer,
    0
  )
where r.metadata ? 'counters';

create or replace view public.agent_overrun_snapshot
with (security_invoker = true)
as
with latest_run as (
  select distinct on (r.project_id)
    r.id,
    r.project_id,
    r.mode,
    r.status,
    r.started_at,
    r.finished_at,
    r.created_at,
    r.supplies_targeted,
    r.supplies_scraped_ok,
    r.supplies_scraped_failed,
    r.forecast_points_written,
    r.alerts_triggered,
    r.error_summary,
    r.metadata
  from public.supply_agent_runs r
  order by r.project_id, r.started_at desc nulls last, r.created_at desc
),
latest_alert as (
  select distinct on (a.project_id)
    a.id,
    a.project_id,
    a.severity,
    a.baseline_budget,
    a.projected_total_cost,
    a.overrun_amount,
    a.overrun_pct,
    a.threshold_pct,
    a.status,
    a.triggered_at
  from public.supply_cost_overrun_alerts a
  order by a.project_id, a.triggered_at desc, a.created_at desc
)
select
  p.id as project_id,
  p.nombre as project_nombre,
  lr.id as last_run_id,
  lr.mode as last_run_mode,
  lr.status as last_run_status,
  lr.started_at as last_run_started_at,
  lr.finished_at as last_run_finished_at,
  coalesce(
    nullif(lr.supplies_targeted, 0),
    nullif(lr.metadata -> 'counters' ->> 'supplies_requested', '')::integer,
    0
  ) as supplies_targeted,
  coalesce(
    nullif(lr.supplies_scraped_ok, 0),
    nullif(lr.metadata -> 'counters' ->> 'supplies_processed', '')::integer,
    0
  ) as supplies_scraped_ok,
  coalesce(
    nullif(lr.supplies_scraped_failed, 0),
    nullif(lr.metadata -> 'counters' ->> 'errors', '')::integer,
    0
  ) as supplies_scraped_failed,
  coalesce(
    nullif(lr.forecast_points_written, 0),
    nullif(lr.metadata -> 'counters' ->> 'forecasts_written', '')::integer,
    0
  ) as forecast_points_written,
  coalesce(
    nullif(lr.alerts_triggered, 0),
    nullif(lr.metadata -> 'counters' ->> 'alerts_created', '')::integer,
    0
  ) as alerts_triggered,
  lr.error_summary,
  la.id as last_alert_id,
  la.severity as last_alert_severity,
  coalesce(
    la.baseline_budget,
    nullif(lr.metadata -> 'budget_summary' ->> 'total_budget_subtotal', '')::numeric(18,2)
  ) as baseline_budget,
  coalesce(
    la.projected_total_cost,
    nullif(lr.metadata -> 'budget_summary' ->> 'projected_subtotal', '')::numeric(18,2)
  ) as projected_total_cost,
  coalesce(
    la.overrun_amount,
    nullif(lr.metadata -> 'budget_summary' ->> 'estimated_indexed_delta', '')::numeric(18,2)
  ) as overrun_amount,
  coalesce(
    la.overrun_pct,
    nullif(lr.metadata -> 'budget_summary' ->> 'estimated_indexed_delta_pct', '')::numeric(7,4)
  ) as overrun_pct,
  coalesce(
    la.threshold_pct,
    nullif(lr.metadata ->> 'overrun_threshold_pct', '')::numeric(7,4)
  ) as threshold_pct,
  la.status as last_alert_status,
  la.triggered_at as last_alert_triggered_at
from public.projects p
left join latest_run lr on lr.project_id = p.id
left join latest_alert la on la.project_id = p.id;
