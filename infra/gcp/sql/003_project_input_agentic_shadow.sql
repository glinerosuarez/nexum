create table if not exists public.project_input_agentic_runs (
  id uuid primary key default gen_random_uuid(),
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  pipeline_variant text not null default 'agentic_shadow',
  status text not null default 'running',
  model_name text,
  retrieval_strategy text,
  prompt_version text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.project_input_agentic_runs is
  'Ejecucion aditiva del pipeline agentic_shadow contra un lote de intake ya persistido.';

create table if not exists public.project_input_agentic_candidates (
  id uuid primary key,
  agentic_run_id uuid not null references public.project_input_agentic_runs(id) on delete cascade,
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  document_id uuid not null references public.project_input_documents(id) on delete cascade,
  candidate_origin text not null,
  deterministic_extracted_row_id uuid references public.project_input_extracted_rows(id) on delete set null,
  deterministic_normalized_supply_id uuid references public.project_input_normalized_supplies(id) on delete set null,
  source_type text not null,
  source_ref jsonb not null default '{}'::jsonb,
  raw_text text not null,
  raw_name text not null,
  raw_unit text,
  raw_category text,
  raw_quantity numeric(18,6),
  raw_unit_price numeric(18,6),
  raw_total_price numeric(18,6),
  context_before jsonb not null default '[]'::jsonb,
  context_after jsonb not null default '[]'::jsonb,
  section_labels jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  raw_columns jsonb not null default '{}'::jsonb,
  span_offsets jsonb not null default '{}'::jsonb,
  table_signature text,
  extraction_confidence text not null,
  extraction_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_input_agentic_candidates_origin_check check (
    candidate_origin in (
      'matched_deterministic_candidate',
      'agentic_only_candidate',
      'agentic_split_from_deterministic_candidate'
    )
  ),
  constraint project_input_agentic_candidates_confidence_check check (
    extraction_confidence in ('high', 'medium', 'low')
  )
);

comment on table public.project_input_agentic_candidates is
  'Candidatos emitidos por extract_shadow_candidates con el contrato completo de evidencia y contexto.';

create table if not exists public.project_input_agentic_row_judgments (
  id uuid primary key default gen_random_uuid(),
  agentic_run_id uuid not null references public.project_input_agentic_runs(id) on delete cascade,
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  candidate_id uuid not null references public.project_input_agentic_candidates(id) on delete cascade,
  extracted_row_id uuid references public.project_input_extracted_rows(id) on delete set null,
  document_id uuid not null references public.project_input_documents(id) on delete cascade,
  judgment_label text not null,
  is_qualified boolean not null,
  is_market_monitorable boolean,
  confidence text not null,
  rationale_summary text,
  evidence jsonb not null default '[]'::jsonb,
  retrieval_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_input_agentic_row_judgments_confidence_check check (
    confidence in ('high', 'medium', 'low')
  ),
  constraint project_input_agentic_row_judgments_label_check check (
    judgment_label in (
      'qualified_supply',
      'heading_or_chapter',
      'scope_or_activity',
      'labor_or_service',
      'bundle_or_mixed_scope',
      'unresolved'
    )
  ),
  constraint project_input_agentic_row_judgments_run_candidate_unique unique (agentic_run_id, candidate_id)
);

comment on table public.project_input_agentic_row_judgments is
  'Juicios de calificacion del shadow pipeline sobre cada candidato persistido.';

create index if not exists project_input_agentic_runs_input_batch_id_idx
  on public.project_input_agentic_runs (input_batch_id, created_at desc);

create index if not exists project_input_agentic_runs_project_id_idx
  on public.project_input_agentic_runs (project_id, created_at desc);

create index if not exists project_input_agentic_candidates_run_id_idx
  on public.project_input_agentic_candidates (agentic_run_id, created_at asc);

create index if not exists project_input_agentic_candidates_input_batch_id_idx
  on public.project_input_agentic_candidates (input_batch_id, created_at asc);

create index if not exists project_input_agentic_candidates_document_id_idx
  on public.project_input_agentic_candidates (document_id);

create index if not exists project_input_agentic_candidates_deterministic_row_id_idx
  on public.project_input_agentic_candidates (deterministic_extracted_row_id);

create index if not exists project_input_agentic_row_judgments_run_id_idx
  on public.project_input_agentic_row_judgments (agentic_run_id, created_at asc);

create index if not exists project_input_agentic_row_judgments_candidate_id_idx
  on public.project_input_agentic_row_judgments (candidate_id);
