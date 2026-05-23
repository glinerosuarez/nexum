-- Phase 1: AI supply-cost agent schema primitives.
-- Adds source registry, observation time series, run logs,
-- forecast storage, and overrun alerts.

create table if not exists public.supply_price_sources (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supply_catalog(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  parse_config jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  is_active boolean not null default true,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_price_sources_priority_nonnegative check (priority >= 0),
  constraint supply_price_sources_unique_per_supply unique (supply_id, source_url)
);

comment on table public.supply_price_sources is
  'Fuentes curadas por insumo para scraping de precio de mercado por el agente.';

create table if not exists public.supply_agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  mode text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  supplies_targeted integer not null default 0,
  supplies_scraped_ok integer not null default 0,
  supplies_scraped_failed integer not null default 0,
  forecast_points_written integer not null default 0,
  alerts_triggered integer not null default 0,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_agent_runs_mode_allowed check (mode in ('manual', 'cron')),
  constraint supply_agent_runs_status_allowed check (status in ('running', 'completed', 'partial', 'failed')),
  constraint supply_agent_runs_counts_nonnegative check (
    supplies_targeted >= 0
    and supplies_scraped_ok >= 0
    and supplies_scraped_failed >= 0
    and forecast_points_written >= 0
    and alerts_triggered >= 0
  ),
  constraint supply_agent_runs_finished_after_started check (
    finished_at is null
    or finished_at >= started_at
  )
);

comment on table public.supply_agent_runs is
  'Ejecuciones del agente de costos de insumos con telemetria por corrida.';

create table if not exists public.supply_price_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supply_id uuid not null references public.supply_catalog(id) on delete cascade,
  source_id uuid references public.supply_price_sources(id) on delete set null,
  agent_run_id uuid references public.supply_agent_runs(id) on delete set null,
  observed_at date not null default current_date,
  observed_ts timestamptz not null default now(),
  unit_price numeric(18,2) not null,
  currency text not null default 'COP',
  confidence numeric(5,2),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_price_observations_unit_price_nonnegative check (unit_price >= 0),
  constraint supply_price_observations_currency_not_blank check (length(trim(currency)) > 0),
  constraint supply_price_observations_confidence_range check (
    confidence is null
    or (confidence >= 0 and confidence <= 1)
  )
);

comment on table public.supply_price_observations is
  'Serie temporal de precios observados por el agente para cada insumo critico.';

create table if not exists public.supply_cost_forecasts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supply_id uuid not null references public.supply_catalog(id) on delete cascade,
  run_id uuid references public.supply_agent_runs(id) on delete set null,
  forecast_date date not null,
  predicted_unit_price numeric(18,2) not null,
  model_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_cost_forecasts_predicted_price_nonnegative check (predicted_unit_price >= 0),
  constraint supply_cost_forecasts_model_version_not_blank check (length(trim(model_version)) > 0),
  constraint supply_cost_forecasts_unique_point unique (project_id, supply_id, run_id, forecast_date)
);

comment on table public.supply_cost_forecasts is
  'Puntos de pronostico por insumo generados por el agente para el horizonte del proyecto.';

create table if not exists public.supply_cost_overrun_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.supply_agent_runs(id) on delete set null,
  severity text not null,
  baseline_budget numeric(18,2) not null,
  projected_total_cost numeric(18,2) not null,
  overrun_amount numeric(18,2) not null,
  overrun_pct numeric(7,4) not null,
  threshold_pct numeric(7,4) not null default 2,
  status text not null default 'open',
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_cost_overrun_alerts_severity_allowed check (severity in ('warn', 'critical')),
  constraint supply_cost_overrun_alerts_status_allowed check (status in ('open', 'resolved')),
  constraint supply_cost_overrun_alerts_nonnegative check (
    baseline_budget >= 0
    and projected_total_cost >= 0
    and overrun_amount >= 0
    and overrun_pct >= 0
    and threshold_pct >= 0
  ),
  constraint supply_cost_overrun_alerts_resolved_state check (
    (status = 'resolved' and resolved_at is not null)
    or (status = 'open' and resolved_at is null)
  )
);

comment on table public.supply_cost_overrun_alerts is
  'Alertas de sobrecosto proyectado cuando el forecast supera el presupuesto onboarding.';

create index if not exists supply_price_sources_supply_id_idx
  on public.supply_price_sources (supply_id);

create index if not exists supply_price_sources_active_priority_idx
  on public.supply_price_sources (is_active, priority);

create index if not exists supply_agent_runs_project_started_idx
  on public.supply_agent_runs (project_id, started_at desc);

create index if not exists supply_agent_runs_status_idx
  on public.supply_agent_runs (status);

create index if not exists supply_price_observations_project_supply_date_idx
  on public.supply_price_observations (project_id, supply_id, observed_at desc);

create index if not exists supply_price_observations_run_idx
  on public.supply_price_observations (agent_run_id);

create index if not exists supply_cost_forecasts_project_supply_date_idx
  on public.supply_cost_forecasts (project_id, supply_id, forecast_date);

create index if not exists supply_cost_forecasts_run_id_idx
  on public.supply_cost_forecasts (run_id);

create index if not exists supply_cost_overrun_alerts_project_status_idx
  on public.supply_cost_overrun_alerts (project_id, status, triggered_at desc);

create index if not exists supply_cost_overrun_alerts_run_id_idx
  on public.supply_cost_overrun_alerts (run_id);

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
    r.supplies_targeted,
    r.supplies_scraped_ok,
    r.supplies_scraped_failed,
    r.forecast_points_written,
    r.alerts_triggered,
    r.error_summary
  from public.supply_agent_runs r
  order by r.project_id, r.started_at desc, r.created_at desc
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
  lr.supplies_targeted,
  lr.supplies_scraped_ok,
  lr.supplies_scraped_failed,
  lr.forecast_points_written,
  lr.alerts_triggered,
  lr.error_summary,
  la.id as last_alert_id,
  la.severity as last_alert_severity,
  la.baseline_budget,
  la.projected_total_cost,
  la.overrun_amount,
  la.overrun_pct,
  la.threshold_pct,
  la.status as last_alert_status,
  la.triggered_at as last_alert_triggered_at
from public.projects p
left join latest_run lr on lr.project_id = p.id
left join latest_alert la on la.project_id = p.id;

comment on view public.agent_overrun_snapshot is
  'Estado mas reciente de corrida del agente y alerta de sobrecosto por proyecto.';

alter table public.supply_price_sources enable row level security;
alter table public.supply_agent_runs enable row level security;
alter table public.supply_price_observations enable row level security;
alter table public.supply_cost_forecasts enable row level security;
alter table public.supply_cost_overrun_alerts enable row level security;

-- Demo policies (anon/public read + write) to keep parity with existing hackathon setup.
drop policy if exists "public_can_read_supply_price_sources" on public.supply_price_sources;
create policy "public_can_read_supply_price_sources"
  on public.supply_price_sources
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_price_sources" on public.supply_price_sources;
create policy "public_can_insert_supply_price_sources"
  on public.supply_price_sources
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_supply_price_sources" on public.supply_price_sources;
create policy "public_can_update_supply_price_sources"
  on public.supply_price_sources
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_read_supply_agent_runs" on public.supply_agent_runs;
create policy "public_can_read_supply_agent_runs"
  on public.supply_agent_runs
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_agent_runs" on public.supply_agent_runs;
create policy "public_can_insert_supply_agent_runs"
  on public.supply_agent_runs
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_supply_agent_runs" on public.supply_agent_runs;
create policy "public_can_update_supply_agent_runs"
  on public.supply_agent_runs
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_read_supply_price_observations" on public.supply_price_observations;
create policy "public_can_read_supply_price_observations"
  on public.supply_price_observations
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_price_observations" on public.supply_price_observations;
create policy "public_can_insert_supply_price_observations"
  on public.supply_price_observations
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_supply_price_observations" on public.supply_price_observations;
create policy "public_can_update_supply_price_observations"
  on public.supply_price_observations
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_read_supply_cost_forecasts" on public.supply_cost_forecasts;
create policy "public_can_read_supply_cost_forecasts"
  on public.supply_cost_forecasts
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_cost_forecasts" on public.supply_cost_forecasts;
create policy "public_can_insert_supply_cost_forecasts"
  on public.supply_cost_forecasts
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_supply_cost_forecasts" on public.supply_cost_forecasts;
create policy "public_can_update_supply_cost_forecasts"
  on public.supply_cost_forecasts
  for update
  to public
  using (true)
  with check (true);

drop policy if exists "public_can_read_supply_cost_overrun_alerts" on public.supply_cost_overrun_alerts;
create policy "public_can_read_supply_cost_overrun_alerts"
  on public.supply_cost_overrun_alerts
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_cost_overrun_alerts" on public.supply_cost_overrun_alerts;
create policy "public_can_insert_supply_cost_overrun_alerts"
  on public.supply_cost_overrun_alerts
  for insert
  to public
  with check (true);

drop policy if exists "public_can_update_supply_cost_overrun_alerts" on public.supply_cost_overrun_alerts;
create policy "public_can_update_supply_cost_overrun_alerts"
  on public.supply_cost_overrun_alerts
  for update
  to public
  using (true)
  with check (true);

drop trigger if exists set_updated_at_supply_price_sources on public.supply_price_sources;
create trigger set_updated_at_supply_price_sources
  before update on public.supply_price_sources
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_supply_agent_runs on public.supply_agent_runs;
create trigger set_updated_at_supply_agent_runs
  before update on public.supply_agent_runs
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_supply_price_observations on public.supply_price_observations;
create trigger set_updated_at_supply_price_observations
  before update on public.supply_price_observations
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_supply_cost_forecasts on public.supply_cost_forecasts;
create trigger set_updated_at_supply_cost_forecasts
  before update on public.supply_cost_forecasts
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_supply_cost_overrun_alerts on public.supply_cost_overrun_alerts;
create trigger set_updated_at_supply_cost_overrun_alerts
  before update on public.supply_cost_overrun_alerts
  for each row execute function public.set_updated_at();
