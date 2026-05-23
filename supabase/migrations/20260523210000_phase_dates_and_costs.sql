-- Add planning fields to project_phases so phases imported from the
-- contract can carry their schedule and budget. Used by the projection
-- curve (CPTP planned value / CPTR earned value) on the dashboard.

alter table public.project_phases
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin date,
  add column if not exists costo_planeado numeric(18,2) not null default 0,
  add column if not exists costo_real numeric(18,2) not null default 0,
  add column if not exists porcentaje_completado numeric(5,2) not null default 0;

alter table public.project_phases
  drop constraint if exists project_phases_planned_dates_order;
alter table public.project_phases
  add constraint project_phases_planned_dates_order check (
    fecha_inicio is null
    or fecha_fin is null
    or fecha_fin >= fecha_inicio
  );

alter table public.project_phases
  drop constraint if exists project_phases_progress_range;
alter table public.project_phases
  add constraint project_phases_progress_range check (
    porcentaje_completado between 0 and 100
  );

alter table public.project_phases
  drop constraint if exists project_phases_costos_nonnegative;
alter table public.project_phases
  add constraint project_phases_costos_nonnegative check (
    costo_planeado >= 0 and costo_real >= 0
  );
