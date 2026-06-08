create table if not exists public.project_input_agentic_supplies (
  id uuid primary key default gen_random_uuid(),
  agentic_run_id uuid not null references public.project_input_agentic_runs(id) on delete cascade,
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  pipeline_variant text not null default 'agentic_shadow',
  display_name text not null,
  canonical_name text not null,
  canonical_unit text,
  canonical_category text not null,
  monitorability_status text not null,
  market_mapping_status text not null,
  quantity_total numeric(18,6),
  unit_price_reference numeric(18,6),
  total_price_reference numeric(18,6),
  source_document_ids jsonb not null default '[]'::jsonb,
  source_extracted_row_ids jsonb not null default '[]'::jsonb,
  deterministic_normalized_supply_id uuid references public.project_input_normalized_supplies(id) on delete set null,
  confidence text not null,
  rationale_summary text,
  retrieval_evidence jsonb not null default '[]'::jsonb,
  mapping_candidate jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_input_agentic_supplies_monitorability_check check (
    monitorability_status in ('monitorable', 'not_monitorable', 'unresolved')
  ),
  constraint project_input_agentic_supplies_mapping_status_check check (
    market_mapping_status in ('mapped', 'unmapped', 'rejected')
  ),
  constraint project_input_agentic_supplies_confidence_check check (
    confidence in ('high', 'medium', 'low')
  )
);

comment on table public.project_input_agentic_supplies is
  'Suministros canonicos producidos por normalization_enrichment del pipeline agentic_shadow.';

create table if not exists public.project_input_agentic_row_links (
  id uuid primary key default gen_random_uuid(),
  agentic_run_id uuid not null references public.project_input_agentic_runs(id) on delete cascade,
  candidate_id uuid not null references public.project_input_agentic_candidates(id) on delete cascade,
  extracted_row_id uuid references public.project_input_extracted_rows(id) on delete set null,
  agentic_supply_id uuid not null references public.project_input_agentic_supplies(id) on delete cascade,
  link_reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_input_agentic_row_links_unique unique (
    agentic_run_id,
    candidate_id,
    agentic_supply_id
  )
);

comment on table public.project_input_agentic_row_links is
  'Vinculos explicitos entre candidatos del shadow pipeline y sus suministros canonicos resultantes.';

create table if not exists public.project_input_agentic_mappings (
  id uuid primary key default gen_random_uuid(),
  agentic_run_id uuid not null references public.project_input_agentic_runs(id) on delete cascade,
  input_batch_id uuid not null references public.project_input_batches(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  agentic_supply_id uuid not null references public.project_input_agentic_supplies(id) on delete cascade,
  mapping_status text not null,
  mapping_strategy text not null,
  series_key text,
  series_id text,
  source_name text,
  source_url text,
  confidence text not null,
  rationale_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_input_agentic_mappings_status_check check (
    mapping_status in ('mapped', 'unmapped', 'rejected')
  ),
  constraint project_input_agentic_mappings_strategy_check check (
    mapping_strategy in (
      'retrieval_catalog_match',
      'keyword_fallback',
      'manual_rule',
      'unmapped'
    )
  ),
  constraint project_input_agentic_mappings_confidence_check check (
    confidence in ('high', 'medium', 'low')
  ),
  constraint project_input_agentic_mappings_supply_unique unique (agentic_run_id, agentic_supply_id)
);

comment on table public.project_input_agentic_mappings is
  'Juicios persistidos de monitorabilidad y market mapping para suministros del shadow pipeline.';

create index if not exists project_input_agentic_supplies_run_id_idx
  on public.project_input_agentic_supplies (agentic_run_id, created_at asc);

create index if not exists project_input_agentic_supplies_input_batch_id_idx
  on public.project_input_agentic_supplies (input_batch_id, created_at asc);

create index if not exists project_input_agentic_supplies_project_id_idx
  on public.project_input_agentic_supplies (project_id, created_at desc);

create index if not exists project_input_agentic_supplies_deterministic_normalized_id_idx
  on public.project_input_agentic_supplies (deterministic_normalized_supply_id);

create index if not exists project_input_agentic_supplies_monitorability_idx
  on public.project_input_agentic_supplies (monitorability_status, market_mapping_status);

create index if not exists project_input_agentic_row_links_run_id_idx
  on public.project_input_agentic_row_links (agentic_run_id, created_at asc);

create index if not exists project_input_agentic_row_links_candidate_id_idx
  on public.project_input_agentic_row_links (candidate_id);

create index if not exists project_input_agentic_row_links_extracted_row_id_idx
  on public.project_input_agentic_row_links (extracted_row_id);

create index if not exists project_input_agentic_row_links_supply_id_idx
  on public.project_input_agentic_row_links (agentic_supply_id);

create index if not exists project_input_agentic_mappings_run_id_idx
  on public.project_input_agentic_mappings (agentic_run_id, created_at asc);

create index if not exists project_input_agentic_mappings_input_batch_id_idx
  on public.project_input_agentic_mappings (input_batch_id, created_at asc);

create index if not exists project_input_agentic_mappings_project_id_idx
  on public.project_input_agentic_mappings (project_id, created_at desc);

create index if not exists project_input_agentic_mappings_supply_id_idx
  on public.project_input_agentic_mappings (agentic_supply_id);

create index if not exists project_input_agentic_mappings_status_idx
  on public.project_input_agentic_mappings (mapping_status, mapping_strategy);
