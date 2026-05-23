-- Construction project management schema for Supabase/PostgreSQL.
-- Single-tenant platform for one construction company.
--
-- Relationship diagram:
-- auth.users -> profiles
-- profiles -> project_memberships
-- projects -> project_memberships
-- projects -> project_phases
-- project_phases -> activities
-- activities -> activity_supplies
-- supply_catalog -> activity_supplies
-- supply_catalog -> supply_availability_alerts
-- projects -> budget_snapshots
-- budget_snapshots -> budget_snapshot_items
-- activity_supplies -> budget_snapshot_items
-- projects -> purchase_orders
-- suppliers -> purchase_orders
-- purchase_orders -> purchase_order_items
-- supply_catalog -> purchase_order_items
-- purchase_orders -> supplier_payments
-- projects -> payroll_periods
-- payroll_periods -> payroll_entries
-- profiles -> payroll_entries
-- projects -> schedule_baselines
-- schedule_baselines -> schedule_items
-- activities -> schedule_items
-- activities -> progress_logs
-- profiles -> progress_logs
-- projects -> incidents
-- activities -> incidents
-- incidents -> incident_actions
-- projects -> daily_reports
-- daily_reports -> daily_report_items
-- activities -> daily_report_items

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_role') then
    create type public.project_role as enum (
      'director_proyecto',
      'residente_obra',
      'residente_administrativo'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum (
      'planificacion',
      'en_ejecucion',
      'pausado',
      'finalizado',
      'cancelado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'supply_type') then
    create type public.supply_type as enum (
      'material',
      'equipo',
      'mano_obra',
      'subcontrato'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'supply_availability') then
    create type public.supply_availability as enum (
      'disponible',
      'escaso',
      'agotado',
      'descontinuado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_status') then
    create type public.alert_status as enum (
      'abierta',
      'resuelta'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'budget_snapshot_status') then
    create type public.budget_snapshot_status as enum (
      'borrador',
      'aprobado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'purchase_order_status') then
    create type public.purchase_order_status as enum (
      'borrador',
      'enviada',
      'aprobada',
      'recibida',
      'cancelada'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'supplier_payment_status') then
    create type public.supplier_payment_status as enum (
      'pendiente',
      'pagado',
      'anulado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'schedule_item_status') then
    create type public.schedule_item_status as enum (
      'pendiente',
      'en_progreso',
      'completado',
      'retrasado',
      'cancelado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'incident_type') then
    create type public.incident_type as enum (
      'incidente',
      'no_conformidad',
      'observacion'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'incident_severity') then
    create type public.incident_severity as enum (
      'baja',
      'media',
      'alta',
      'critica'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'incident_status') then
    create type public.incident_status as enum (
      'abierto',
      'en_revision',
      'cerrado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'incident_action_status') then
    create type public.incident_action_status as enum (
      'pendiente',
      'en_progreso',
      'completada',
      'cancelada'
    );
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  job_title text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Extiende auth.users con informacion operacional del colaborador; los roles por proyecto viven en project_memberships.';

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'Usuario'),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  ubicacion text,
  estado public.project_status not null default 'planificacion',
  fecha_inicio_planeada date,
  fecha_fin_planeada date,
  fecha_inicio_real date,
  fecha_fin_real date,
  presupuesto_total numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_presupuesto_total_nonnegative check (presupuesto_total >= 0),
  constraint projects_planned_dates_order check (
    fecha_inicio_planeada is null
    or fecha_fin_planeada is null
    or fecha_fin_planeada >= fecha_inicio_planeada
  ),
  constraint projects_actual_dates_order check (
    fecha_inicio_real is null
    or fecha_fin_real is null
    or fecha_fin_real >= fecha_inicio_real
  )
);

comment on table public.projects is
  'Proyecto de construccion administrado por la empresa, con fechas, estado y presupuesto total de referencia.';

create table public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_memberships_project_profile_unique unique (project_id, profile_id)
);

comment on table public.project_memberships is
  'Relacion usuario-proyecto donde se asigna el rol operativo especifico para cada proyecto.';

create unique index project_memberships_single_resident_roles_idx
  on public.project_memberships (project_id, role)
  where active
    and role in ('residente_obra', 'residente_administrativo');

create table public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  nombre text not null,
  descripcion text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_phases_project_name_unique unique (project_id, nombre)
);

comment on table public.project_phases is
  'Fases principales del proyecto, por ejemplo cimentacion, estructura o acabados.';

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.project_phases(id) on delete cascade,
  nombre text not null,
  descripcion text,
  unidad_medida text not null,
  cantidad_planeada numeric(14,4) not null default 0,
  cantidad_ejecutada numeric(14,4) not null default 0,
  progress_percentage numeric(5,2) generated always as (
    case
      when cantidad_planeada <= 0 then 0
      else least(100, round((cantidad_ejecutada / cantidad_planeada) * 100, 2))
    end
  ) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_quantities_nonnegative check (
    cantidad_planeada >= 0
    and cantidad_ejecutada >= 0
  ),
  constraint activities_phase_name_unique unique (phase_id, nombre)
);

comment on table public.activities is
  'Actividades APU dentro de una fase; son la unidad base para presupuesto, cronograma y seguimiento.';

create table public.supply_catalog (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  unidad_medida text not null,
  tipo public.supply_type not null,
  precio_referencia numeric(18,2) not null default 0,
  disponibilidad public.supply_availability not null default 'disponible',
  es_critico boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_catalog_nombre_unique unique (nombre),
  constraint supply_catalog_precio_nonnegative check (precio_referencia >= 0)
);

comment on table public.supply_catalog is
  'Catalogo global de insumos reutilizables entre proyectos, con criticidad y disponibilidad de mercado.';

create table public.supply_availability_alerts (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supply_catalog(id) on delete cascade,
  disponibilidad public.supply_availability not null,
  estado public.alert_status not null default 'abierta',
  mensaje text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_availability_alerts_resolved_state check (
    (estado = 'resuelta' and resolved_at is not null)
    or (estado = 'abierta' and resolved_at is null)
  )
);

comment on table public.supply_availability_alerts is
  'Alertas generadas automaticamente para insumos criticos con disponibilidad escasa, agotada o descontinuada.';

create unique index supply_availability_alerts_one_open_per_supply_idx
  on public.supply_availability_alerts (supply_id)
  where estado = 'abierta';

create or replace function public.manage_critical_supply_alert()
returns trigger
language plpgsql
as $$
begin
  if new.es_critico
     and new.disponibilidad in ('escaso', 'agotado', 'descontinuado') then
    insert into public.supply_availability_alerts (
      supply_id,
      disponibilidad,
      estado,
      mensaje
    )
    values (
      new.id,
      new.disponibilidad,
      'abierta',
      'Insumo critico con disponibilidad ' || new.disponibilidad::text
    )
    on conflict (supply_id)
      where estado = 'abierta'
    do update
      set disponibilidad = excluded.disponibilidad,
          mensaje = excluded.mensaje,
          updated_at = now();
  else
    update public.supply_availability_alerts
    set estado = 'resuelta',
        resolved_at = now(),
        updated_at = now()
    where supply_id = new.id
      and estado = 'abierta';
  end if;

  return new;
end;
$$;

create trigger manage_critical_supply_alert
  after insert or update of disponibilidad, es_critico
  on public.supply_catalog
  for each row execute function public.manage_critical_supply_alert();

create table public.activity_supplies (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  supply_id uuid not null references public.supply_catalog(id) on delete restrict,
  cantidad_planeada numeric(14,4) not null default 0,
  cantidad_ejecutada numeric(14,4) not null default 0,
  precio_unitario numeric(18,2) not null,
  subtotal numeric(18,2) generated always as (
    round(cantidad_planeada * precio_unitario, 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_supplies_activity_supply_unique unique (activity_id, supply_id),
  constraint activity_supplies_values_nonnegative check (
    cantidad_planeada >= 0
    and cantidad_ejecutada >= 0
    and precio_unitario >= 0
  )
);

comment on table public.activity_supplies is
  'Detalle APU que relaciona actividades con insumos, cantidades, precio unitario y subtotal calculado.';

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit_rut text not null,
  contacto text,
  telefono text,
  email text,
  direccion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_nit_rut_unique unique (nit_rut)
);

comment on table public.suppliers is
  'Proveedores y contratistas externos usados para compras y pagos.';

create table public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  snapshot_date timestamptz not null default now(),
  estado public.budget_snapshot_status not null default 'borrador',
  total_budget numeric(18,2) not null default 0,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_snapshots_project_version_unique unique (project_id, version_number),
  constraint budget_snapshots_total_nonnegative check (total_budget >= 0),
  constraint budget_snapshots_approval_fields check (
    (estado = 'aprobado' and approved_by is not null and approved_at is not null)
    or (estado = 'borrador')
  )
);

comment on table public.budget_snapshots is
  'Versiones del presupuesto derivado del APU del proyecto, con estado de aprobacion.';

create table public.budget_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  budget_snapshot_id uuid not null references public.budget_snapshots(id) on delete cascade,
  activity_supply_id uuid not null references public.activity_supplies(id) on delete restrict,
  cantidad_planeada numeric(14,4) not null,
  precio_unitario numeric(18,2) not null,
  subtotal numeric(18,2) generated always as (
    round(cantidad_planeada * precio_unitario, 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_snapshot_items_unique unique (budget_snapshot_id, activity_supply_id),
  constraint budget_snapshot_items_values_nonnegative check (
    cantidad_planeada >= 0
    and precio_unitario >= 0
  )
);

comment on table public.budget_snapshot_items is
  'Lineas congeladas de cada version presupuestal para preservar cantidades y precios del APU.';

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  order_number text not null,
  estado public.purchase_order_status not null default 'borrador',
  fecha_emision date not null default current_date,
  fecha_entrega_esperada date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_order_number_unique unique (order_number),
  constraint purchase_orders_delivery_after_issue check (
    fecha_entrega_esperada is null
    or fecha_entrega_esperada >= fecha_emision
  )
);

comment on table public.purchase_orders is
  'Ordenes de compra por proyecto y proveedor para abastecimiento de insumos.';

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  supply_id uuid not null references public.supply_catalog(id) on delete restrict,
  cantidad numeric(14,4) not null,
  precio_unitario numeric(18,2) not null,
  subtotal numeric(18,2) generated always as (
    round(cantidad * precio_unitario, 2)
  ) stored,
  es_prioritario boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_items_unique unique (purchase_order_id, supply_id),
  constraint purchase_order_items_values_positive check (
    cantidad > 0
    and precio_unitario >= 0
  )
);

comment on table public.purchase_order_items is
  'Lineas de orden de compra vinculadas al catalogo; insumos criticos se marcan como prioritarios.';

create or replace function public.set_purchase_order_item_priority()
returns trigger
language plpgsql
as $$
begin
  select sc.es_critico
  into new.es_prioritario
  from public.supply_catalog sc
  where sc.id = new.supply_id;

  return new;
end;
$$;

create trigger set_purchase_order_item_priority
  before insert or update of supply_id
  on public.purchase_order_items
  for each row execute function public.set_purchase_order_item_priority();

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  monto numeric(18,2) not null,
  fecha_pago date,
  metodo_pago text,
  comprobante_url text,
  estado public.supplier_payment_status not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_payments_monto_positive check (monto > 0),
  constraint supplier_payments_paid_date_required check (
    estado <> 'pagado'
    or fecha_pago is not null
  )
);

comment on table public.supplier_payments is
  'Pagos a proveedores asociados a ordenes de compra, con comprobante y estado.';

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_periods_dates_order check (fecha_fin >= fecha_inicio),
  constraint payroll_periods_project_period_unique unique (project_id, fecha_inicio, fecha_fin)
);

comment on table public.payroll_periods is
  'Periodos de nomina asociados a un proyecto de obra.';

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  salario_base numeric(18,2) not null default 0,
  deducciones numeric(18,2) not null default 0,
  bonificaciones numeric(18,2) not null default 0,
  total_neto numeric(18,2) generated always as (
    round(salario_base - deducciones + bonificaciones, 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_entries_period_profile_unique unique (payroll_period_id, profile_id),
  constraint payroll_entries_amounts_nonnegative check (
    salario_base >= 0
    and deducciones >= 0
    and bonificaciones >= 0
  )
);

comment on table public.payroll_entries is
  'Entrada de nomina por persona y periodo, con total neto calculado.';

create table public.schedule_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  nombre text not null default 'Linea base',
  fecha_creacion timestamptz not null default now(),
  aprobado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_baselines_project_name_unique unique (project_id, nombre)
);

comment on table public.schedule_baselines is
  'Linea base aprobada o propuesta del cronograma del proyecto.';

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_baseline_id uuid not null references public.schedule_baselines(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  fecha_inicio_planeada date not null,
  fecha_fin_planeada date not null,
  fecha_inicio_real date,
  fecha_fin_real date,
  progress_percentage numeric(5,2) not null default 0,
  estado public.schedule_item_status not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_items_baseline_activity_unique unique (schedule_baseline_id, activity_id),
  constraint schedule_items_progress_range check (progress_percentage between 0 and 100),
  constraint schedule_items_planned_dates_order check (fecha_fin_planeada >= fecha_inicio_planeada),
  constraint schedule_items_actual_dates_order check (
    fecha_inicio_real is null
    or fecha_fin_real is null
    or fecha_fin_real >= fecha_inicio_real
  )
);

comment on table public.schedule_items is
  'Items del cronograma vinculados a actividades APU con fechas planeadas, reales, avance y estado.';

create table public.progress_logs (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  fecha date not null default current_date,
  porcentaje_reportado numeric(5,2) not null,
  cantidad_ejecutada numeric(14,4) not null default 0,
  reportado_por uuid references public.profiles(id) on delete set null,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_logs_percentage_range check (porcentaje_reportado between 0 and 100),
  constraint progress_logs_quantity_nonnegative check (cantidad_ejecutada >= 0)
);

comment on table public.progress_logs is
  'Historico de avance reportado por actividad para trazabilidad de ejecucion.';

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  tipo public.incident_type not null,
  descripcion text not null,
  severidad public.incident_severity not null default 'media',
  estado public.incident_status not null default 'abierto',
  fecha_ocurrencia timestamptz not null,
  reportado_por uuid references public.profiles(id) on delete set null,
  fecha_cierre timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incidents_closed_date_required check (
    estado <> 'cerrado'
    or fecha_cierre is not null
  )
);

comment on table public.incidents is
  'Incidentes, no conformidades y observaciones por proyecto, opcionalmente asociados a una actividad.';

create table public.incident_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  descripcion text not null,
  responsable_id uuid references public.profiles(id) on delete set null,
  fecha_compromiso date,
  fecha_completada date,
  estado public.incident_action_status not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incident_actions_completed_date_required check (
    estado <> 'completada'
    or fecha_completada is not null
  )
);

comment on table public.incident_actions is
  'Acciones correctivas o preventivas asociadas a incidentes y no conformidades.';

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  fecha date not null,
  clima text,
  personal_presente integer not null default 0,
  avance_narrativo text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_reports_personal_nonnegative check (personal_presente >= 0),
  constraint daily_reports_project_date_unique unique (project_id, fecha)
);

comment on table public.daily_reports is
  'Bitacora diaria del proyecto con clima, personal presente y avance narrativo.';

create table public.daily_report_items (
  id uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  cantidad_ejecutada numeric(14,4) not null default 0,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_report_items_report_activity_unique unique (daily_report_id, activity_id),
  constraint daily_report_items_quantity_nonnegative check (cantidad_ejecutada >= 0)
);

comment on table public.daily_report_items is
  'Detalle de actividades reportadas en la bitacora diaria.';

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
    execute format('drop trigger if exists set_updated_at_%I on public.%I', table_name, table_name);
    execute format(
      'create trigger set_updated_at_%I before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

create index profiles_created_at_idx on public.profiles (created_at);
create index profiles_active_idx on public.profiles (active);

create index projects_estado_idx on public.projects (estado);
create index projects_created_at_idx on public.projects (created_at);

create index project_memberships_project_id_idx on public.project_memberships (project_id);
create index project_memberships_profile_id_idx on public.project_memberships (profile_id);
create index project_memberships_role_idx on public.project_memberships (role);
create index project_memberships_created_at_idx on public.project_memberships (created_at);

create index project_phases_project_id_idx on public.project_phases (project_id);
create index project_phases_created_at_idx on public.project_phases (created_at);

create index activities_phase_id_idx on public.activities (phase_id);
create index activities_created_at_idx on public.activities (created_at);

create index supply_catalog_tipo_idx on public.supply_catalog (tipo);
create index supply_catalog_disponibilidad_idx on public.supply_catalog (disponibilidad);
create index supply_catalog_es_critico_idx on public.supply_catalog (es_critico);
create index supply_catalog_created_at_idx on public.supply_catalog (created_at);

create index supply_availability_alerts_supply_id_idx on public.supply_availability_alerts (supply_id);
create index supply_availability_alerts_estado_idx on public.supply_availability_alerts (estado);
create index supply_availability_alerts_disponibilidad_idx on public.supply_availability_alerts (disponibilidad);
create index supply_availability_alerts_created_at_idx on public.supply_availability_alerts (created_at);

create index activity_supplies_activity_id_idx on public.activity_supplies (activity_id);
create index activity_supplies_supply_id_idx on public.activity_supplies (supply_id);
create index activity_supplies_created_at_idx on public.activity_supplies (created_at);

create index suppliers_activo_idx on public.suppliers (activo);
create index suppliers_created_at_idx on public.suppliers (created_at);

create index budget_snapshots_project_id_idx on public.budget_snapshots (project_id);
create index budget_snapshots_estado_idx on public.budget_snapshots (estado);
create index budget_snapshots_created_at_idx on public.budget_snapshots (created_at);

create index budget_snapshot_items_budget_snapshot_id_idx on public.budget_snapshot_items (budget_snapshot_id);
create index budget_snapshot_items_activity_supply_id_idx on public.budget_snapshot_items (activity_supply_id);
create index budget_snapshot_items_created_at_idx on public.budget_snapshot_items (created_at);

create index purchase_orders_project_id_idx on public.purchase_orders (project_id);
create index purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index purchase_orders_estado_idx on public.purchase_orders (estado);
create index purchase_orders_created_at_idx on public.purchase_orders (created_at);

create index purchase_order_items_purchase_order_id_idx on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_supply_id_idx on public.purchase_order_items (supply_id);
create index purchase_order_items_es_prioritario_idx on public.purchase_order_items (es_prioritario);
create index purchase_order_items_created_at_idx on public.purchase_order_items (created_at);

create index supplier_payments_purchase_order_id_idx on public.supplier_payments (purchase_order_id);
create index supplier_payments_estado_idx on public.supplier_payments (estado);
create index supplier_payments_created_at_idx on public.supplier_payments (created_at);

create index payroll_periods_project_id_idx on public.payroll_periods (project_id);
create index payroll_periods_created_at_idx on public.payroll_periods (created_at);

create index payroll_entries_payroll_period_id_idx on public.payroll_entries (payroll_period_id);
create index payroll_entries_profile_id_idx on public.payroll_entries (profile_id);
create index payroll_entries_created_at_idx on public.payroll_entries (created_at);

create index schedule_baselines_project_id_idx on public.schedule_baselines (project_id);
create index schedule_baselines_created_at_idx on public.schedule_baselines (created_at);

create index schedule_items_schedule_baseline_id_idx on public.schedule_items (schedule_baseline_id);
create index schedule_items_activity_id_idx on public.schedule_items (activity_id);
create index schedule_items_estado_idx on public.schedule_items (estado);
create index schedule_items_created_at_idx on public.schedule_items (created_at);

create index progress_logs_activity_id_idx on public.progress_logs (activity_id);
create index progress_logs_reportado_por_idx on public.progress_logs (reportado_por);
create index progress_logs_created_at_idx on public.progress_logs (created_at);

create index incidents_project_id_idx on public.incidents (project_id);
create index incidents_activity_id_idx on public.incidents (activity_id);
create index incidents_estado_idx on public.incidents (estado);
create index incidents_severidad_idx on public.incidents (severidad);
create index incidents_created_at_idx on public.incidents (created_at);

create index incident_actions_incident_id_idx on public.incident_actions (incident_id);
create index incident_actions_estado_idx on public.incident_actions (estado);
create index incident_actions_created_at_idx on public.incident_actions (created_at);

create index daily_reports_project_id_idx on public.daily_reports (project_id);
create index daily_reports_created_at_idx on public.daily_reports (created_at);

create index daily_report_items_daily_report_id_idx on public.daily_report_items (daily_report_id);
create index daily_report_items_activity_id_idx on public.daily_report_items (activity_id);
create index daily_report_items_created_at_idx on public.daily_report_items (created_at);

create or replace view public.management_report_data
with (security_invoker = true)
as
with activity_budget as (
  select
    a.id as activity_id,
    ph.project_id,
    coalesce(sum(aps.subtotal), 0)::numeric(18,2) as planned_budget
  from public.activities a
  join public.project_phases ph on ph.id = a.phase_id
  left join public.activity_supplies aps on aps.activity_id = a.id
  group by a.id, ph.project_id
),
project_budget as (
  select
    project_id,
    coalesce(sum(planned_budget), 0)::numeric(18,2) as presupuesto_apu
  from activity_budget
  group by project_id
),
project_progress as (
  select
    ab.project_id,
    case
      when sum(ab.planned_budget) > 0 then
        round(sum(a.progress_percentage * ab.planned_budget) / sum(ab.planned_budget), 2)
      else
        round(coalesce(avg(a.progress_percentage), 0), 2)
    end as avance_global_percent
  from activity_budget ab
  join public.activities a on a.id = ab.activity_id
  group by ab.project_id
),
supplier_spend as (
  select
    po.project_id,
    coalesce(sum(sp.monto) filter (where sp.estado = 'pagado'), 0)::numeric(18,2) as pagos_proveedores
  from public.purchase_orders po
  left join public.supplier_payments sp on sp.purchase_order_id = po.id
  group by po.project_id
),
payroll_spend as (
  select
    pp.project_id,
    coalesce(sum(pe.total_neto), 0)::numeric(18,2) as pagos_nomina
  from public.payroll_periods pp
  left join public.payroll_entries pe on pe.payroll_period_id = pp.id
  group by pp.project_id
),
open_incidents as (
  select
    project_id,
    count(*)::integer as incidentes_abiertos
  from public.incidents
  where estado <> 'cerrado'
  group by project_id
)
select
  p.id as project_id,
  p.nombre as project_nombre,
  p.estado,
  coalesce(pp.avance_global_percent, 0)::numeric(5,2) as avance_global_percent,
  coalesce(pb.presupuesto_apu, 0)::numeric(18,2) as presupuesto_apu,
  p.presupuesto_total as presupuesto_total_registrado,
  coalesce(nullif(pb.presupuesto_apu, 0), p.presupuesto_total, 0)::numeric(18,2) as presupuesto_total,
  (
    coalesce(ss.pagos_proveedores, 0)
    + coalesce(ps.pagos_nomina, 0)
  )::numeric(18,2) as gasto_ejecutado,
  case
    when p.fecha_inicio_planeada is null or p.fecha_fin_planeada is null then null
    else greatest((p.fecha_fin_planeada - p.fecha_inicio_planeada) + 1, 0)
  end as dias_planeados,
  case
    when coalesce(p.fecha_inicio_real, p.fecha_inicio_planeada) is null then null
    else greatest((current_date - coalesce(p.fecha_inicio_real, p.fecha_inicio_planeada)) + 1, 0)
  end as dias_transcurridos,
  case
    when p.fecha_inicio_planeada is null
      or p.fecha_fin_planeada is null
      or (p.fecha_fin_planeada - p.fecha_inicio_planeada) < 0 then null
    else least(
      100,
      round(
        (
          greatest((current_date - p.fecha_inicio_planeada) + 1, 0)::numeric
          / greatest((p.fecha_fin_planeada - p.fecha_inicio_planeada) + 1, 1)::numeric
        ) * 100,
        2
      )
    )
  end as avance_planeado_percent,
  case
    when p.fecha_inicio_planeada is null
      or p.fecha_fin_planeada is null
      or greatest((current_date - p.fecha_inicio_planeada) + 1, 0) = 0 then null
    else round(
      coalesce(pp.avance_global_percent, 0)
      / nullif(
          least(
            100,
            round(
              (
                greatest((current_date - p.fecha_inicio_planeada) + 1, 0)::numeric
                / greatest((p.fecha_fin_planeada - p.fecha_inicio_planeada) + 1, 1)::numeric
              ) * 100,
              2
            )
          ),
          0
        ),
      4
    )
  end as spi_basico,
  case
    when (
      coalesce(ss.pagos_proveedores, 0)
      + coalesce(ps.pagos_nomina, 0)
    ) <= 0 then null
    else round(
      (
        coalesce(nullif(pb.presupuesto_apu, 0), p.presupuesto_total, 0)
        * coalesce(pp.avance_global_percent, 0)
        / 100
      )
      / (
        coalesce(ss.pagos_proveedores, 0)
        + coalesce(ps.pagos_nomina, 0)
      ),
      4
    )
  end as cpi_basico,
  coalesce(oi.incidentes_abiertos, 0) as incidentes_abiertos,
  coalesce(
    (
      select jsonb_agg(
        distinct jsonb_build_object(
          'supply_id', sc.id,
          'nombre', sc.nombre,
          'disponibilidad', sc.disponibilidad,
          'tipo', sc.tipo
        )
      )
      from public.project_phases ph
      join public.activities a on a.phase_id = ph.id
      join public.activity_supplies aps on aps.activity_id = a.id
      join public.supply_catalog sc on sc.id = aps.supply_id
      where ph.project_id = p.id
        and sc.es_critico
        and sc.disponibilidad <> 'disponible'
    ),
    '[]'::jsonb
  ) as alertas_insumos_criticos
from public.projects p
left join project_budget pb on pb.project_id = p.id
left join project_progress pp on pp.project_id = p.id
left join supplier_spend ss on ss.project_id = p.id
left join payroll_spend ps on ps.project_id = p.id
left join open_incidents oi on oi.project_id = p.id;

comment on view public.management_report_data is
  'Consolidado gerencial por proyecto: avance ponderado, presupuesto, gasto, SPI/CPI, incidentes y alertas de insumos criticos.';

-- Datos de ejemplo.
create temp table seed_users (
  id uuid primary key,
  email text not null,
  full_name text not null,
  phone text,
  job_title text,
  role public.project_role not null
) on commit drop;

insert into seed_users (id, email, full_name, phone, job_title, role)
values
  (gen_random_uuid(), 'directora.proyecto@example.com', 'Laura Gomez', '+57 300 111 1111', 'Directora de proyecto', 'director_proyecto'),
  (gen_random_uuid(), 'residente.obra@example.com', 'Carlos Rios', '+57 300 222 2222', 'Residente de obra', 'residente_obra'),
  (gen_random_uuid(), 'residente.admin@example.com', 'Marta Silva', '+57 300 333 3333', 'Residente administrativo', 'residente_administrativo');

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  su.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  su.email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', su.full_name),
  now(),
  now()
from seed_users su
where not exists (
  select 1
  from auth.users au
  where au.email = su.email
);

update public.profiles p
set phone = su.phone,
    job_title = su.job_title,
    active = true,
    updated_at = now()
from seed_users su
where p.id = su.id;

create temp table seed_ids (
  key text primary key,
  id uuid not null
) on commit drop;

with inserted_project as (
  insert into public.projects (
    nombre,
    descripcion,
    ubicacion,
    estado,
    fecha_inicio_planeada,
    fecha_fin_planeada,
    fecha_inicio_real,
    presupuesto_total
  )
  values (
    'Edificio Nexum Central',
    'Construccion de edificio corporativo de 12 niveles.',
    'Bogota, Colombia',
    'en_ejecucion',
    date '2026-05-01',
    date '2026-10-31',
    date '2026-05-03',
    0
  )
  returning id
)
insert into seed_ids (key, id)
select 'project_main', id
from inserted_project;

insert into public.project_memberships (project_id, profile_id, role)
select
  (select id from seed_ids where key = 'project_main'),
  su.id,
  su.role
from seed_users su;

create temp table seed_phases (
  nombre text primary key,
  id uuid not null
) on commit drop;

with inserted_phases as (
  insert into public.project_phases (project_id, nombre, descripcion, sort_order)
  values
    ((select id from seed_ids where key = 'project_main'), 'Cimentacion', 'Excavacion y fundaciones.', 1),
    ((select id from seed_ids where key = 'project_main'), 'Estructura', 'Elementos estructurales en concreto.', 2)
  returning id, nombre
)
insert into seed_phases (nombre, id)
select nombre, id
from inserted_phases;

create temp table seed_activities (
  nombre text primary key,
  id uuid not null
) on commit drop;

with inserted_activities as (
  insert into public.activities (
    phase_id,
    nombre,
    descripcion,
    unidad_medida,
    cantidad_planeada,
    cantidad_ejecutada,
    sort_order
  )
  values
    ((select id from seed_phases where nombre = 'Cimentacion'), 'Excavacion mecanica', 'Excavacion con retroexcavadora.', 'm3', 500, 180, 1),
    ((select id from seed_phases where nombre = 'Cimentacion'), 'Concreto de zapatas', 'Concreto premezclado para zapatas.', 'm3', 120, 30, 2),
    ((select id from seed_phases where nombre = 'Estructura'), 'Acero de refuerzo', 'Suministro e instalacion de acero.', 'kg', 18000, 4200, 1),
    ((select id from seed_phases where nombre = 'Estructura'), 'Formaleta losa', 'Formaleta para losas de entrepiso.', 'm2', 2200, 0, 2)
  returning id, nombre
)
insert into seed_activities (nombre, id)
select nombre, id
from inserted_activities;

create temp table seed_supplies (
  nombre text primary key,
  id uuid not null
) on commit drop;

with inserted_supplies as (
  insert into public.supply_catalog (
    nombre,
    descripcion,
    unidad_medida,
    tipo,
    precio_referencia,
    disponibilidad,
    es_critico,
    activo
  )
  values
    ('Concreto 3000 PSI', 'Concreto premezclado certificado.', 'm3', 'material', 390000, 'disponible', true, true),
    ('Acero corrugado #5', 'Varilla de acero para refuerzo estructural.', 'kg', 'material', 5200, 'escaso', true, true),
    ('Retroexcavadora 20T', 'Equipo para excavacion mecanica.', 'hora', 'equipo', 180000, 'disponible', false, true),
    ('Cuadrilla estructural', 'Mano de obra para armado y fundida.', 'jornal', 'mano_obra', 240000, 'disponible', false, true),
    ('Formaleta metalica', 'Sistema de formaleta reutilizable.', 'm2', 'subcontrato', 42000, 'agotado', true, true)
  returning id, nombre
)
insert into seed_supplies (nombre, id)
select nombre, id
from inserted_supplies;

insert into public.activity_supplies (
  activity_id,
  supply_id,
  cantidad_planeada,
  cantidad_ejecutada,
  precio_unitario
)
values
  ((select id from seed_activities where nombre = 'Excavacion mecanica'), (select id from seed_supplies where nombre = 'Retroexcavadora 20T'), 160, 60, 175000),
  ((select id from seed_activities where nombre = 'Concreto de zapatas'), (select id from seed_supplies where nombre = 'Concreto 3000 PSI'), 120, 30, 385000),
  ((select id from seed_activities where nombre = 'Acero de refuerzo'), (select id from seed_supplies where nombre = 'Acero corrugado #5'), 18000, 4200, 5100),
  ((select id from seed_activities where nombre = 'Acero de refuerzo'), (select id from seed_supplies where nombre = 'Cuadrilla estructural'), 90, 21, 235000),
  ((select id from seed_activities where nombre = 'Formaleta losa'), (select id from seed_supplies where nombre = 'Formaleta metalica'), 2200, 0, 41000);

update public.projects p
set presupuesto_total = budget.total_budget,
    updated_at = now()
from (
  select
    ph.project_id,
    sum(aps.subtotal)::numeric(18,2) as total_budget
  from public.project_phases ph
  join public.activities a on a.phase_id = ph.id
  join public.activity_supplies aps on aps.activity_id = a.id
  group by ph.project_id
) budget
where p.id = budget.project_id;

create temp table seed_suppliers (
  nombre text primary key,
  id uuid not null
) on commit drop;

with inserted_suppliers as (
  insert into public.suppliers (
    nombre,
    nit_rut,
    contacto,
    telefono,
    email,
    direccion
  )
  values
    ('Suministros Andinos SAS', '900123456-7', 'Andres Perez', '+57 601 555 0101', 'ventas@suministrosandinos.example', 'Cra 10 #20-30'),
    ('Equipos Norte LTDA', '901222333-4', 'Diana Torres', '+57 601 555 0202', 'comercial@equiposnorte.example', 'Calle 80 #15-22')
  returning id, nombre
)
insert into seed_suppliers (nombre, id)
select nombre, id
from inserted_suppliers;

with director as (
  select id from seed_users where role = 'director_proyecto'
), snapshot as (
  insert into public.budget_snapshots (
    project_id,
    version_number,
    estado,
    total_budget,
    approved_by,
    approved_at,
    notes
  )
  select
    (select id from seed_ids where key = 'project_main'),
    1,
    'aprobado',
    p.presupuesto_total,
    (select id from director),
    now(),
    'Presupuesto inicial aprobado desde APU.'
  from public.projects p
  where p.id = (select id from seed_ids where key = 'project_main')
  returning id
)
insert into public.budget_snapshot_items (
  budget_snapshot_id,
  activity_supply_id,
  cantidad_planeada,
  precio_unitario
)
select
  (select id from snapshot),
  aps.id,
  aps.cantidad_planeada,
  aps.precio_unitario
from public.activity_supplies aps
join public.activities a on a.id = aps.activity_id
join public.project_phases ph on ph.id = a.phase_id
where ph.project_id = (select id from seed_ids where key = 'project_main');

create temp table seed_purchase_orders (
  order_number text primary key,
  id uuid not null
) on commit drop;

with inserted_po as (
  insert into public.purchase_orders (
    project_id,
    supplier_id,
    order_number,
    estado,
    fecha_emision,
    fecha_entrega_esperada,
    notes,
    created_by
  )
  values (
    (select id from seed_ids where key = 'project_main'),
    (select id from seed_suppliers where nombre = 'Suministros Andinos SAS'),
    'OC-2026-0001',
    'aprobada',
    date '2026-05-10',
    date '2026-05-25',
    'Compra prioritaria de acero por disponibilidad escasa.',
    (select id from seed_users where role = 'residente_administrativo')
  )
  returning id, order_number
)
insert into seed_purchase_orders (order_number, id)
select order_number, id
from inserted_po;

insert into public.purchase_order_items (
  purchase_order_id,
  supply_id,
  cantidad,
  precio_unitario
)
values
  ((select id from seed_purchase_orders where order_number = 'OC-2026-0001'), (select id from seed_supplies where nombre = 'Acero corrugado #5'), 8000, 5150),
  ((select id from seed_purchase_orders where order_number = 'OC-2026-0001'), (select id from seed_supplies where nombre = 'Concreto 3000 PSI'), 60, 388000);

insert into public.supplier_payments (
  purchase_order_id,
  monto,
  fecha_pago,
  metodo_pago,
  comprobante_url,
  estado
)
values (
  (select id from seed_purchase_orders where order_number = 'OC-2026-0001'),
  15000000,
  date '2026-05-15',
  'transferencia',
  'https://example.com/comprobantes/oc-2026-0001.pdf',
  'pagado'
);

with payroll_period as (
  insert into public.payroll_periods (
    project_id,
    fecha_inicio,
    fecha_fin
  )
  values (
    (select id from seed_ids where key = 'project_main'),
    date '2026-05-01',
    date '2026-05-15'
  )
  returning id
)
insert into public.payroll_entries (
  payroll_period_id,
  profile_id,
  salario_base,
  deducciones,
  bonificaciones
)
select
  (select id from payroll_period),
  su.id,
  case su.role
    when 'director_proyecto' then 4500000
    when 'residente_obra' then 3200000
    else 2800000
  end,
  250000,
  150000
from seed_users su;

with baseline as (
  insert into public.schedule_baselines (
    project_id,
    nombre,
    fecha_creacion,
    aprobado_por
  )
  values (
    (select id from seed_ids where key = 'project_main'),
    'Linea base inicial',
    now(),
    (select id from seed_users where role = 'director_proyecto')
  )
  returning id
)
insert into public.schedule_items (
  schedule_baseline_id,
  activity_id,
  fecha_inicio_planeada,
  fecha_fin_planeada,
  fecha_inicio_real,
  fecha_fin_real,
  progress_percentage,
  estado
)
values
  ((select id from baseline), (select id from seed_activities where nombre = 'Excavacion mecanica'), date '2026-05-01', date '2026-05-20', date '2026-05-03', null, 36, 'en_progreso'),
  ((select id from baseline), (select id from seed_activities where nombre = 'Concreto de zapatas'), date '2026-05-18', date '2026-06-05', date '2026-05-20', null, 25, 'en_progreso'),
  ((select id from baseline), (select id from seed_activities where nombre = 'Acero de refuerzo'), date '2026-06-01', date '2026-08-15', null, null, 23.33, 'pendiente'),
  ((select id from baseline), (select id from seed_activities where nombre = 'Formaleta losa'), date '2026-06-10', date '2026-09-15', null, null, 0, 'pendiente');

insert into public.progress_logs (
  activity_id,
  fecha,
  porcentaje_reportado,
  cantidad_ejecutada,
  reportado_por,
  observaciones
)
values
  ((select id from seed_activities where nombre = 'Excavacion mecanica'), date '2026-05-15', 36, 180, (select id from seed_users where role = 'residente_obra'), 'Avance segun topografia de control.'),
  ((select id from seed_activities where nombre = 'Concreto de zapatas'), date '2026-05-15', 25, 30, (select id from seed_users where role = 'residente_obra'), 'Fundidas primeras zapatas eje A.');

with incident as (
  insert into public.incidents (
    project_id,
    activity_id,
    tipo,
    descripcion,
    severidad,
    estado,
    fecha_ocurrencia,
    reportado_por
  )
  values (
    (select id from seed_ids where key = 'project_main'),
    (select id from seed_activities where nombre = 'Excavacion mecanica'),
    'observacion',
    'Se requiere reforzar senalizacion perimetral en zona de excavacion.',
    'media',
    'abierto',
    timestamp with time zone '2026-05-14 08:30:00+00',
    (select id from seed_users where role = 'residente_obra')
  )
  returning id
)
insert into public.incident_actions (
  incident_id,
  descripcion,
  responsable_id,
  fecha_compromiso,
  estado
)
values (
  (select id from incident),
  'Instalar cinta, malla y avisos preventivos adicionales.',
  (select id from seed_users where role = 'residente_obra'),
  date '2026-05-16',
  'pendiente'
);

with report as (
  insert into public.daily_reports (
    project_id,
    fecha,
    clima,
    personal_presente,
    avance_narrativo,
    creado_por
  )
  values (
    (select id from seed_ids where key = 'project_main'),
    date '2026-05-15',
    'Soleado',
    42,
    'Se avanza en excavacion y armado preliminar de zapatas.',
    (select id from seed_users where role = 'residente_obra')
  )
  returning id
)
insert into public.daily_report_items (
  daily_report_id,
  activity_id,
  cantidad_ejecutada,
  observaciones
)
values
  ((select id from report), (select id from seed_activities where nombre = 'Excavacion mecanica'), 35, 'Retiro de material con dos volquetas.'),
  ((select id from report), (select id from seed_activities where nombre = 'Concreto de zapatas'), 8, 'Fundida parcial en frente norte.');
