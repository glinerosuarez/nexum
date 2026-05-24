-- ETL support for supply market price updates used in cost-overrun monitoring.

create table if not exists public.supply_price_update_batches (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_channel text not null default 'upload_manual',
  observed_at date not null default current_date,
  uploaded_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_price_update_batches_source_channel_not_blank check (length(trim(source_channel)) > 0)
);

comment on table public.supply_price_update_batches is
  'Cabecera por lote ETL de precios de mercado de insumos.';

create table if not exists public.supply_price_update_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.supply_price_update_batches(id) on delete cascade,
  line_number integer not null,
  source_supply_id uuid,
  source_supply_name text not null,
  source_unit text,
  supply_id uuid references public.supply_catalog(id) on delete restrict,
  unit_price numeric(18,2) not null,
  currency text not null default 'COP',
  status text not null default 'matched',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_price_update_rows_batch_line_unique unique (batch_id, line_number),
  constraint supply_price_update_rows_price_nonnegative check (unit_price >= 0),
  constraint supply_price_update_rows_status_allowed check (status in ('matched', 'unmatched')),
  constraint supply_price_update_rows_currency_not_blank check (length(trim(currency)) > 0)
);

comment on table public.supply_price_update_rows is
  'Detalle por fila del lote ETL, con resultado de mapeo al catalogo de insumos.';

create index if not exists supply_price_update_rows_supply_id_idx
  on public.supply_price_update_rows (supply_id);

create index if not exists supply_price_update_rows_status_idx
  on public.supply_price_update_rows (status);

create index if not exists supply_price_update_rows_batch_id_idx
  on public.supply_price_update_rows (batch_id);

create or replace view public.latest_supply_prices
with (security_invoker = true)
as
select distinct on (r.supply_id)
  r.supply_id,
  r.unit_price,
  b.observed_at,
  b.source_file_name,
  b.source_channel,
  r.created_at as imported_at
from public.supply_price_update_rows r
join public.supply_price_update_batches b on b.id = r.batch_id
where r.status = 'matched'
  and r.supply_id is not null
order by r.supply_id, b.observed_at desc, b.created_at desc, r.created_at desc;

comment on view public.latest_supply_prices is
  'Ultimo precio de mercado conocido por insumo a partir de lotes ETL.';

alter table public.supply_price_update_batches enable row level security;
alter table public.supply_price_update_rows enable row level security;

drop policy if exists "public_can_read_supply_price_update_batches" on public.supply_price_update_batches;
create policy "public_can_read_supply_price_update_batches"
  on public.supply_price_update_batches
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_price_update_batches" on public.supply_price_update_batches;
create policy "public_can_insert_supply_price_update_batches"
  on public.supply_price_update_batches
  for insert
  to public
  with check (true);

drop policy if exists "public_can_read_supply_price_update_rows" on public.supply_price_update_rows;
create policy "public_can_read_supply_price_update_rows"
  on public.supply_price_update_rows
  for select
  to public
  using (true);

drop policy if exists "public_can_insert_supply_price_update_rows" on public.supply_price_update_rows;
create policy "public_can_insert_supply_price_update_rows"
  on public.supply_price_update_rows
  for insert
  to public
  with check (true);

drop trigger if exists set_updated_at_supply_price_update_batches on public.supply_price_update_batches;
create trigger set_updated_at_supply_price_update_batches
  before update on public.supply_price_update_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_supply_price_update_rows on public.supply_price_update_rows;
create trigger set_updated_at_supply_price_update_rows
  before update on public.supply_price_update_rows
  for each row execute function public.set_updated_at();
