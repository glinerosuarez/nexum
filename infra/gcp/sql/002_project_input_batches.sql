create table if not exists public.project_input_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'analyzed',
  merged_preview jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_input_batches is
  'Lote de intake persistido para insumos derivados de documentos antes de la creacion o seleccion del proyecto.';

create table if not exists public.project_input_documents (
  id uuid primary key default gen_random_uuid(),
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  filename text not null,
  source text not null,
  content_type text,
  byte_size bigint not null default 0,
  parse_status text not null,
  confidence text not null default 'baja',
  notes jsonb not null default '[]'::jsonb,
  content_hash text not null,
  preview jsonb not null default '{}'::jsonb,
  sheet_names jsonb not null default '[]'::jsonb,
  extracted_row_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_input_documents is
  'Metadata por archivo del lote intake, sin persistir el binario original.';

create table if not exists public.project_input_extracted_rows (
  id uuid primary key default gen_random_uuid(),
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  document_id uuid not null references public.project_input_documents(id) on delete cascade,
  source text not null,
  source_ref jsonb not null default '{}'::jsonb,
  raw_name text not null,
  raw_unit text,
  raw_category text,
  raw_quantity numeric(18,6),
  raw_unit_price numeric(18,6),
  raw_total_price numeric(18,6),
  normalized_name text not null,
  normalized_unit text,
  normalized_category text not null,
  normalization_key text not null,
  notes jsonb not null default '[]'::jsonb,
  raw_columns jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_input_extracted_rows is
  'Filas crudas extraidas de CSV/APU/XLSX con trazabilidad al documento y fuente original.';

create table if not exists public.project_input_normalized_supplies (
  id uuid primary key default gen_random_uuid(),
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  normalization_key text not null,
  display_name text not null,
  normalized_name text not null,
  normalized_unit text,
  normalized_category text not null,
  quantity_total numeric(18,6),
  unit_price_reference numeric(18,6),
  total_price_reference numeric(18,6),
  row_count integer not null default 0,
  source_count integer not null default 0,
  source_document_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_input_normalized_supplies_batch_key_unique unique (input_batch_id, normalization_key)
);

comment on table public.project_input_normalized_supplies is
  'Candidatos normalizados y deduplicados usados para la seleccion de insumos del agente.';

create table if not exists public.project_input_row_normalizations (
  id uuid primary key default gen_random_uuid(),
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  extracted_row_id uuid not null references public.project_input_extracted_rows(id) on delete cascade,
  normalized_supply_id uuid not null references public.project_input_normalized_supplies(id) on delete cascade,
  normalization_reason text not null,
  created_at timestamptz not null default now(),
  constraint project_input_row_normalizations_unique unique (extracted_row_id, normalized_supply_id)
);

comment on table public.project_input_row_normalizations is
  'Relacion explicita entre cada fila extraida y el candidato normalizado al que fue asignada.';

create index if not exists project_input_batches_project_id_idx
  on public.project_input_batches (project_id, created_at desc);

create index if not exists project_input_batches_created_by_profile_id_idx
  on public.project_input_batches (created_by_profile_id, created_at desc);

create index if not exists project_input_documents_input_batch_id_idx
  on public.project_input_documents (input_batch_id, created_at asc);

create index if not exists project_input_documents_content_hash_idx
  on public.project_input_documents (content_hash);

create index if not exists project_input_extracted_rows_input_batch_id_idx
  on public.project_input_extracted_rows (input_batch_id, created_at asc);

create index if not exists project_input_extracted_rows_document_id_idx
  on public.project_input_extracted_rows (document_id);

create index if not exists project_input_extracted_rows_normalization_key_idx
  on public.project_input_extracted_rows (normalization_key);

create index if not exists project_input_normalized_supplies_input_batch_id_idx
  on public.project_input_normalized_supplies (input_batch_id, created_at asc);

create index if not exists project_input_row_normalizations_input_batch_id_idx
  on public.project_input_row_normalizations (input_batch_id, created_at asc);

create index if not exists project_input_row_normalizations_normalized_supply_id_idx
  on public.project_input_row_normalizations (normalized_supply_id);
