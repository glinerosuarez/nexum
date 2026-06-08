# Block 2 Subplan: Shadow Agentic Retrieval Pipeline

Date: 2026-06-04

## Summary
This subplan defines the next implementation track after the deterministic baseline and Arize instrumentation are in place.

The goal is not to replace the current deterministic supply-intelligence pipeline immediately. The goal is to build a shadow agentic retrieval pipeline that runs end-to-end from the same contractual documents, produces the same classes of artifacts, and can be compared directly against the deterministic baseline in Arize before any default-path cutover is considered.

This is a quality-improvement workstream, not a runtime rewrite.

## Current Status
The first executable shadow slice is now implemented in the monorepo and deployed.

Implemented so far:
1. Additive Cloud SQL schema for:
  - `project_input_agentic_runs`
  - `project_input_agentic_candidates`
  - `project_input_agentic_row_judgments`
2. Monorepo backend support under `Nexum-IA/mcp-fca-hackaton` for:
  - creating a shadow run,
  - persisting `extract_shadow_candidates` outputs,
  - qualifying stored candidates,
  - reading project-level supply-selection comparison data.
3. Frontend analysis-route wiring so upload analysis now:
  - persists deterministic Block 2 intake first,
  - translates client-side ids to persisted ids,
  - creates an `agentic_shadow` run,
  - immediately runs qualification.
4. First end-to-end shadow candidate extraction from row-emitting contractual sources:
  - `csv`
  - `xlsx`
  - `apu_markdown`
5. First qualification scaffold over persisted shadow candidates with labels:
  - `qualified_supply`
  - `heading_or_chapter`
  - `scope_or_activity`
  - `bundle_or_mixed_scope`
  - `labor_or_service`
  - `unresolved`

Current limits of the implemented slice:
1. The shadow path is still heuristic and table-anchored.
2. It is not yet LLM-driven or fully retrieval-augmented.
3. XML, PDF, DOCX, and generic free-text sources are not yet producing shadow candidates.
4. Normalization enrichment and monitorability improvement are not yet separate persisted stages.

## First Live Verification
The first fully verified end-to-end shadow run came from:
1. `project_id`: `3eb6f116-29da-4574-8180-71e169aa6855`
2. `input_batch_id`: `07cbb135-0037-45a8-a875-95720b64c53e`
3. `agentic_run_id`: `01bd9386-a758-47ab-b823-fd657cbe850a`

Verified results from Cloud SQL:
1. Deterministic baseline for the same batch:
  - `document_count = 4`
  - `extracted_row_count = 143`
  - `normalized_supply_count = 143`
2. Shadow extraction output:
  - `candidate_count = 159`
  - `matched_deterministic_candidate = 143`
  - `agentic_only_candidate = 16`
  - `agentic_split_from_deterministic_candidate = 0`
3. Shadow qualification output:
  - `qualified_supply = 52`
  - `bundle_or_mixed_scope = 50`
  - `scope_or_activity = 32`
  - `heading_or_chapter = 19`
  - `unresolved = 6`
4. Shadow summary metrics:
  - `qualified_supply_count = 52`
  - `rejected_candidate_count = 107`
  - `monitorable_supply_count = 2`

This first live run proves the intended architecture:
1. preserve the deterministic baseline for comparison,
2. broaden candidate recall beyond deterministic extraction,
3. classify the broader candidate set into useful vs noisy buckets before later normalization and mapping work.

Examples of `agentic_only_candidate` rows recovered in the first verified run:
1. `RED SUMINISTRO DE AGUA POTABLE`
2. `RED AGUAS RESIDUALES`
3. `DISTRIBUCIÓN ELÉCTRICA NORMALIZADA`
4. `TABLEROS`
5. `SISTEMA DE AIRE ACONDICIONADO`
6. `APARATOS SANITARIOS`

Those examples also show the current limitation clearly: many `agentic_only_candidate` rows are section or system labels, which is why the qualification layer still rejects or downgrades many of them. That is acceptable for the first shadow slice because it proves the intended shape:
1. broaden extraction first,
2. classify afterward,
3. compare honestly against deterministic precision and recall.

## Immediate Next Steps
The immediate implementation order after the first live shadow deployment is now tracked in:

[block2-subplan-phoenix-iteration-comparison.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-phoenix-iteration-comparison.md)

That handoff plan is the current ordered next-step list for:
1. Phoenix joinability and discoverability,
2. mapping coverage improvement,
3. deterministic linkage at the shadow-supply layer,
4. Phoenix comparison dashboards/evals.

Historical implementation notes from the earlier shadow rollout remain below.

The next work should tighten the shadow pipeline in this order:

1. Fix `project_id` propagation on persisted shadow artifacts.
- In the first verified run, `project_input_agentic_candidates.project_id` is null because the shadow run is created during analysis before the batch is bound to the project.
- This must be fixed or backfilled so project-scoped candidate and judgment reads are reliable.

2. Make comparison reads robust against pre-project and post-project lifecycle timing.
- Comparison endpoints should prefer stable joins through:
  - `agentic_run_id`
  - `input_batch_id`
  - `document_id`
- They should not rely on `project_id` alone until propagation is correct.

3. Add explicit persisted stages for:
- normalization enrichment,
- shadow normalized supplies,
- monitorability and mapping judgments.

4. Upgrade extraction from a heuristic table-only shadow pass into the fuller retrieval-assisted design described below.
- first expand candidate context retrieval,
- then add task-specific model judgments,
- then compare deterministic vs agentic spans in Arize.

5. Expand source coverage.
- Priority should stay on the existing high-value row-emitting path first.
- After that, evaluate whether PDF and DOCX text/table recovery adds real supply recall.

6. Keep deterministic and shadow comparison measurable in Arize.
- The shadow path should eventually expose:
  - extraction recall improvement,
  - qualification precision improvement,
  - monitorability coverage improvement,
  - unresolved rate by variant.

## Goal
1. Build a shadow agentic retrieval variant that starts from the same uploaded contractual documents and can derive its own extracted candidates end to end.
2. Improve true-supply qualification, normalization quality, and market-monitorable coverage without breaking provenance.
3. Compare deterministic and agentic variants on the same projects using the same trace structure and evaluation metrics in Arize.
4. Decide whether the agentic path is good enough to become the default only after measurable improvement is demonstrated.

## Why A Shadow Pipeline
- The deterministic path now provides a stable baseline:
  - extracted rows,
  - normalized supplies,
  - mapped/unmapped coverage,
  - Arize traces and metrics.
- The current failure mode is mostly quality, not runtime reliability:
  - headings,
  - scopes,
  - activity bundles,
  - weak market mappings,
  - high unresolved subtotal.
- Restricting the agentic path to deterministic rows could hide recall failures in the deterministic parser itself.
- A shadow path lets the team compare both variants honestly on the same source documents, the same project, and the same downstream expectations.

## Product Framing
This workstream supports the current product direction:

`an agentic supply-intelligence pipeline that converts contractual documents into traceable, market-monitorable critical supplies`

The agentic retrieval path should be presented as a better qualification and mapping layer over contractual evidence, not as an unconstrained autonomous workflow.

## Scope
In scope:
1. End-to-end shadow extraction, qualification, normalization, and retrieval over the same contractual documents.
2. Comparison-ready outputs aligned with deterministic artifacts.
3. Arize comparison spans and metrics.
4. Readback/debug support so both variants are inspectable on the same project/input batch.

Out of scope:
1. Immediate replacement of deterministic parsing.
2. Forecasting/risk algorithm redesign.
3. Major UI redesign.
4. Fully autonomous multi-agent orchestration beyond what is needed for qualification and mapping quality.

## Proposed Architecture
The shadow agentic path should be additive and comparison-friendly.

### Inputs
The agentic pipeline should consume the same uploaded contractual batch and persisted document metadata already produced by Block 2:
1. `project_input_documents`
2. merged preview fields
3. document-level parse notes and source metadata
4. deterministic artifacts for comparison only:
  - `project_input_extracted_rows`
  - `project_input_normalized_supplies`
  - `project_input_row_normalizations`

It may use deterministic artifacts as retrieval hints or comparison anchors, but it should be allowed to derive its own extracted candidates from the source documents rather than inheriting deterministic extraction as a hard boundary.

### Core Stages
1. `document_ingest`
- Reuse the persisted batch and document metadata.
- Do not re-upload or re-store binaries.

2. `row_extraction`
- Run an end-to-end agentic extraction pass over the contractual documents represented in the persisted batch.
- Allow the shadow path to emit candidate rows that were never surfaced by deterministic extraction.
- Preserve document-level provenance so every shadow candidate still links back to source file and source region metadata.

3. `supply_qualification`
- Decide whether each extracted row or normalized candidate is:
  - a real purchasable supply,
  - a heading/chapter,
  - a scope/activity bundle,
  - a labor/service-heavy description,
  - unresolved/needs retrieval.

4. `retrieval_enrichment`
- Use retrieval over:
  - source row text,
  - sibling rows,
  - sheet/document context,
  - known material vocabulary,
  - existing market/source catalog hints.
- Produce structured judgments, not free-form output only.

5. `normalization_enrichment`
- Improve canonical naming, unit interpretation, and category assignment.
- Preserve the deterministic normalization key for comparison where possible.
- Add agentic reasoning metadata separately rather than overwriting deterministic provenance.

6. `market_mapping`
- Suggest better source mappings or mark items as non-monitorable when appropriate.
- Do not force a mapping for rows that are not actually market-monitorable.

7. `critical_supply_selection`
- Produce a comparison-ready candidate set for downstream forecast/risk evaluation.

## Proposed Agentic Pipeline Design
The first shadow implementation should be a constrained retrieval-and-judgment pipeline, not an open-ended general agent.

### Design Principles
1. Start from the same contractual documents, not from a different onboarding flow.
2. Use retrieval to improve extraction and judgment quality, not to invent missing provenance.
3. Require structured outputs at every stage.
4. Keep the agent state machine narrow and inspectable.
5. Prefer abstention or `unresolved` over weak forced mappings.

### Pipeline Shape
The shadow path should operate as a sequence of bounded steps over one input batch.

1. `document loading`
- Load:
  - persisted document metadata,
  - source refs,
  - parse notes,
  - sheet names,
  - merged preview fields.
- Build a working document set where each future candidate can reference:
  - `input_batch_id`
  - `document_id`
  - source file metadata

2. `agentic candidate extraction`
- Derive shadow candidate rows end to end from the contractual documents.
- Preserve raw text fragments, section context, and source refs for each candidate.
- Where possible, later link each shadow candidate to:
  - an existing deterministic extracted row,
  - or mark it as `agentic_only_candidate` if the deterministic path missed it.

### `extract_shadow_candidates` Output Contract
This step needs a fixed interface before implementation. The shadow extractor is allowed to be model-assisted, but it should emit a strict structured record for every candidate.

#### Contract goal
`extract_shadow_candidates` should answer:
1. what candidate row the shadow path found,
2. where it came from,
3. what raw quantitative fields were observed,
4. whether it aligns with a deterministic extracted row,
5. what context should be available to later retrieval and qualification steps.

#### Required fields per emitted candidate
1. `shadow_candidate_id: string`
- new UUID generated by the shadow pipeline

2. `input_batch_id: string`

3. `document_id: string`

4. `candidate_origin: string`
- allowed values:
  - `matched_deterministic_candidate`
  - `agentic_only_candidate`
  - `agentic_split_from_deterministic_candidate`

5. `deterministic_extracted_row_id: string | null`
- required when the candidate clearly matches a deterministic extracted row
- null when the candidate is agentic-only

6. `source_type: string`
- expected examples:
  - `xlsx`
  - `csv`
  - `apu_markdown`
  - `pdf_table`
  - `docx_table`
  - `docx_text`
  - `xml_context`

7. `source_ref: object`
- required minimum subfields when available:
  - `filename`
  - `sheet_name`
  - `row_index`
  - `table_index`
  - `page_number`
  - `cell_range`

8. `raw_text: string`
- the best raw textual fragment representing the candidate

9. `raw_name: string`
- the extracted candidate description before qualification/normalization

10. `raw_unit: string | null`

11. `raw_category: string | null`

12. `raw_quantity: number | null`

13. `raw_unit_price: number | null`

14. `raw_total_price: number | null`

15. `context_before: string[]`
- nearby heading/neighbor rows before this candidate

16. `context_after: string[]`
- nearby rows after this candidate

17. `section_labels: string[]`
- section/chapter labels inferred from the document region

18. `evidence_refs: object[]`
- expected examples:
  - `{ "type": "row_text", "value": "..." }`
  - `{ "type": "neighbor_heading", "value": "..." }`
  - `{ "type": "sheet_name", "value": "PRESUPUESTO OFICIAL" }`

19. `extraction_confidence: string`
- allowed values:
  - `high`
  - `medium`
  - `low`

20. `extraction_notes: string[]`
- additive diagnostic notes, not final judgments

#### Optional fields
1. `deterministic_normalized_supply_id: string | null`
- only when there is already a clear deterministic normalized match

2. `raw_columns: object`
- key-value view of parsed cells when available

3. `span_offsets: object | null`
- for text-like sources if exact offsets are available

4. `table_signature: string | null`
- stable identifier for the local table/region if helpful for grouping

#### Validity rules
A shadow candidate is valid only if:
1. `shadow_candidate_id`, `input_batch_id`, `document_id`, `candidate_origin`, `source_type`, `raw_text`, `raw_name`, and `extraction_confidence` are present.
2. `candidate_origin` is one of the allowed enum values.
3. `extraction_confidence` is one of `high|medium|low`.
4. `deterministic_extracted_row_id` is non-null for `matched_deterministic_candidate`.
5. `deterministic_extracted_row_id` is null for `agentic_only_candidate`.
6. numeric fields are either null or valid numeric values.
7. provenance fields never point to a different `input_batch_id`.

#### Expected behavior by origin
1. `matched_deterministic_candidate`
- the shadow extractor found the same candidate concept already present in deterministic extraction
- later comparison can measure whether downstream judgments improved even when recall did not

2. `agentic_only_candidate`
- the shadow extractor found a candidate that deterministic extraction missed entirely
- later comparison can measure recall improvement

3. `agentic_split_from_deterministic_candidate`
- the shadow extractor split one coarse deterministic row into multiple finer-grained candidate supplies
- later comparison can measure whether decomposition improved monitorability

#### Example record
```json
{
  "shadow_candidate_id": "c3a9c92f-6fd7-4a2a-b0d8-4b3af8e8592d",
  "input_batch_id": "fbd7582c-c29a-4ac1-81f6-50710b9ffd4d",
  "document_id": "58a3d5d2-c98a-4a7e-a9e2-daf68eb27d7c",
  "candidate_origin": "agentic_only_candidate",
  "deterministic_extracted_row_id": null,
  "source_type": "xlsx",
  "source_ref": {
    "filename": "PRESUPUESTO CONTRACTUAL.xlsx",
    "sheet_name": "PRESUPUESTO OFICIAL",
    "row_index": 42
  },
  "raw_text": "S/I tablero electrico bifasico con capacidad para 12 circuitos",
  "raw_name": "S/I tablero electrico bifasico con capacidad para 12 circuitos",
  "raw_unit": "und",
  "raw_category": null,
  "raw_quantity": 2,
  "raw_unit_price": 6950000,
  "raw_total_price": 13900000,
  "context_before": ["INSTALACIONES ELECTRICAS"],
  "context_after": ["S/I parcial desde tablero principal..."],
  "section_labels": ["INSTALACIONES ELECTRICAS"],
  "evidence_refs": [
    {"type": "sheet_name", "value": "PRESUPUESTO OFICIAL"},
    {"type": "neighbor_heading", "value": "INSTALACIONES ELECTRICAS"}
  ],
  "extraction_confidence": "medium",
  "extraction_notes": ["Recovered as agentic candidate from local row context."]
}
```

3. `context retrieval`
- Retrieve the local context needed to judge each candidate:
  - exact row text and normalized fields,
  - nearby rows in the same worksheet/table,
  - section headers above the row,
  - sibling rows that share category or block position,
  - document-level source type and parse status,
  - known market/source vocabulary hints,
  - deterministic mapping result if one exists.
- The retrieval unit should be small and explicit:
  - `candidate row`
  - `preceding heading rows`
  - `neighbor rows`
  - `document/source metadata`

4. `qualification judgment`
- For each candidate, the agent should decide:
  - is this a true purchasable supply?
  - is it a heading/chapter?
  - is it a scope/activity bundle?
  - is it labor/service-heavy?
  - is it unresolved?
- Required output:
  - `judgment_label`
  - `is_qualified`
  - `is_market_monitorable`
  - `confidence`
  - `rationale_summary`
  - `evidence_refs`

5. `grouping and normalization judgment`
- For qualified rows only, the agent should decide:
  - canonical name,
  - canonical unit,
  - canonical category,
  - whether multiple rows should collapse into one shadow supply,
  - whether a deterministic normalized supply already represents this item.
- Required output:
  - `canonical_name`
  - `canonical_unit`
  - `canonical_category`
  - `group_key`
  - `deterministic_normalized_supply_id` if matched
  - `confidence`
  - `rationale_summary`

6. `monitorability and market-mapping judgment`
- For each shadow supply, the agent should decide:
  - whether it is market-monitorable,
  - whether it should map to an existing series/source family,
  - whether it should remain unresolved,
  - whether it should be explicitly rejected from monitoring.
- Required output:
  - `monitorability_status`
  - `mapping_status`
  - `mapping_strategy`
  - `series_key` or `candidate_series_keys`
  - `confidence`
  - `rationale_summary`

7. `comparison-ready selection output`
- Produce a shadow selected-supply set with:
  - qualified supplies,
  - rejected candidates,
  - unresolved candidates,
  - mapped supplies,
  - unmapped supplies,
  - exposure subtotals,
  - provenance links.

### Retrieval Design
The retrieval part should be local-first and artifact-grounded.

#### Retrieval sources
1. raw text fragments or parsed table cell content derived from source documents
2. `source_ref` metadata
3. adjacent rows from same document/sheet
4. document-level parse notes
5. deterministic extracted rows as comparison hints, not hard input requirements
6. deterministic normalized supplies as comparison hints, not hard input requirements
7. known mapping vocabulary and source families

#### Retrieval objectives
1. identify headings and section labels from surrounding text
2. distinguish materials from bundled work descriptions
3. recover canonical commodity intent from noisy line items
4. use neighboring rows to interpret truncated or ambiguous descriptions

#### Retrieval non-goals
1. no web search in the first shadow version
2. no free-form external research loop
3. no replacement of stored provenance with generated summaries

## Agent State Machine
The shadow path should be deterministic in orchestration even if judgments are model-assisted.

### State sequence
1. `load_documents`
2. `extract_shadow_candidates`
3. `retrieve_context`
4. `judge_qualification`
5. `build_shadow_supplies`
6. `judge_monitorability`
7. `produce_comparison_artifacts`
8. `persist_shadow_results`

### State outputs
Each state should emit structured JSON-like records, not prose blobs.

Example per-row judgment shape:
```json
{
  "shadow_candidate_id": "uuid",
  "deterministic_extracted_row_id": "uuid|null",
  "judgment_label": "qualified_supply",
  "is_qualified": true,
  "is_market_monitorable": true,
  "confidence": "high",
  "rationale_summary": "Concrete supply item with explicit unit and quantity.",
  "evidence_refs": [
    {"type": "row_text", "value": "SUMINISTRO DE ..."},
    {"type": "neighbor_heading", "value": "ELEMENTOS ARQUITECTONICOS"}
  ]
}
```

Example per-shadow-supply mapping shape:
```json
{
  "agentic_supply_id": "uuid",
  "monitorability_status": "monitorable",
  "mapping_status": "mapped",
  "mapping_strategy": "retrieval_catalog_match",
  "series_key": "steel",
  "confidence": "medium",
  "rationale_summary": "Description aligns with corrugated steel rebar family."
}
```

## Prompt / Policy Design
The first implementation should not use one giant prompt. It should use small task-specific prompts or structured policy calls.

Recommended prompt families:
1. `qualification_prompt`
- classify row into:
  - supply,
  - heading,
  - scope/activity,
  - labor/service,
  - unresolved

2. `normalization_prompt`
- canonicalize:
  - name,
  - unit,
  - category,
  - grouping key

3. `monitorability_prompt`
- decide:
  - market-monitorable vs not
  - candidate source family if monitorable

Each prompt should:
1. include the candidate row
2. include retrieved neighboring context
3. require structured output
4. allow `unresolved`
5. prohibit inventing provenance or hidden sources

## Guardrails
The shadow path should be deliberately conservative.

### Hard rules
1. Never drop the original deterministic provenance identifiers.
2. Never map a supply without recording the mapping rationale.
3. Never promote a heading or scope row directly into a monitorable supply without explicit evidence.
4. Never overwrite deterministic artifacts.
5. Never claim confidence `high` when the row is semantically ambiguous.

### Abstention rules
Use `unresolved` when:
1. the row is too truncated to classify confidently
2. the context is contradictory
3. the row mixes labor/service/material in one inseparable bundle
4. the market-monitorable commodity family is unclear

## V1 Implementation Boundary
The first agentic shadow version should stay small.

### Included in V1
1. end-to-end shadow candidate extraction from source documents
2. row-level qualification judgments
3. local-context retrieval from persisted artifacts and extracted text regions
4. shadow normalized supplies
5. monitorability judgments
6. comparison output and Arize instrumentation

### Deferred from V1
1. external web retrieval
2. multi-turn autonomous planning loops
3. automatic self-healing retries across many branches
4. human-in-the-loop review UI
5. direct replacement of production supply selection

## How V1 Should Beat The Deterministic Baseline
The first success condition is not “perfect mapping.” The first success condition is better filtering and cleaner candidate sets.

Expected early wins:
1. recovery of real supply candidates that deterministic extraction missed
2. fewer heading/chapter false positives
3. fewer scope/activity false positives
4. more honest unresolved classification
5. better monitorability precision on the qualified set

The first version is allowed to trade some recall for better precision, as long as provenance and comparison metrics are preserved.

## Data Model Strategy
The shadow path should not mutate deterministic records in place.

Preferred approach:
1. Persist shadow outputs in additive tables or additive variant fields.
2. Tag every artifact with a pipeline variant:
  - `deterministic`
  - `agentic_shadow`
3. Preserve linkages to:
  - `input_batch_id`
  - `document_id`
  - `extracted_row_id`
  - `normalized_supply_id`
4. Store confidence, rationale summaries, and retrieval evidence references as additive metadata.

If schema work is needed, it should follow the same Cloud SQL-first rule as the rest of Block 2.

## Proposed Storage Contract
The first implementation should be additive and explicit. The deterministic pipeline remains the canonical producer for:
- `project_input_batches`
- `project_input_documents`
- `project_input_extracted_rows`
- `project_input_normalized_supplies`
- `project_input_row_normalizations`

The agentic shadow path should attach to that intake batch instead of replacing it.

### New Batch-Level Record
Add a shadow-run header table, for example:

`project_input_agentic_runs`

Required fields:
1. `id UUID PK`
2. `input_batch_id UUID NOT NULL`
3. `project_id UUID NULL`
4. `pipeline_variant TEXT NOT NULL`
  - default expected value for this track: `agentic_shadow`
5. `status TEXT NOT NULL`
  - expected states:
    - `running`
    - `completed`
    - `failed`
6. `model_name TEXT NULL`
7. `retrieval_strategy TEXT NULL`
8. `prompt_version TEXT NULL`
9. `summary JSONB NOT NULL DEFAULT '{}'`
10. `created_by_profile_id UUID NOT NULL`
11. `created_at TIMESTAMPTZ NOT NULL`
12. `updated_at TIMESTAMPTZ NOT NULL`

Purpose:
- one row per shadow pipeline execution against a deterministic input batch
- stable parent id for all later agentic artifacts
- place to store aggregate metrics and failure summaries

### Shadow Candidate Records
Add a table for the direct `extract_shadow_candidates` outputs, for example:

`project_input_agentic_candidates`

Required fields:
1. `id UUID PK`
2. `agentic_run_id UUID NOT NULL`
3. `input_batch_id UUID NOT NULL`
4. `project_id UUID NULL`
5. `document_id UUID NOT NULL`
6. `candidate_origin TEXT NOT NULL`
  - expected values:
    - `matched_deterministic_candidate`
    - `agentic_only_candidate`
    - `agentic_split_from_deterministic_candidate`
7. `deterministic_extracted_row_id UUID NULL`
8. `deterministic_normalized_supply_id UUID NULL`
9. `source_type TEXT NOT NULL`
10. `source_ref JSONB NOT NULL DEFAULT '{}'`
11. `raw_text TEXT NOT NULL`
12. `raw_name TEXT NOT NULL`
13. `raw_unit TEXT NULL`
14. `raw_category TEXT NULL`
15. `raw_quantity NUMERIC NULL`
16. `raw_unit_price NUMERIC NULL`
17. `raw_total_price NUMERIC NULL`
18. `context_before JSONB NOT NULL DEFAULT '[]'`
19. `context_after JSONB NOT NULL DEFAULT '[]'`
20. `section_labels JSONB NOT NULL DEFAULT '[]'`
21. `evidence_refs JSONB NOT NULL DEFAULT '[]'`
22. `raw_columns JSONB NOT NULL DEFAULT '{}'`
23. `span_offsets JSONB NOT NULL DEFAULT '{}'`
24. `table_signature TEXT NULL`
25. `extraction_confidence TEXT NOT NULL`
26. `extraction_notes JSONB NOT NULL DEFAULT '[]'`
27. `created_at TIMESTAMPTZ NOT NULL`
28. `updated_at TIMESTAMPTZ NOT NULL`

Purpose:
- persist the shadow extraction contract exactly as emitted
- allow end-to-end agentic extraction even when no deterministic row exists
- provide the stable parent record for later retrieval and qualification judgments

### Row-Level Qualification Records
Add a table for row judgments, for example:

`project_input_agentic_row_judgments`

Required fields:
1. `id UUID PK`
2. `agentic_run_id UUID NOT NULL`
3. `input_batch_id UUID NOT NULL`
4. `candidate_id UUID NOT NULL`
5. `extracted_row_id UUID NULL`
6. `document_id UUID NOT NULL`
7. `judgment_label TEXT NOT NULL`
  - expected values:
    - `qualified_supply`
    - `heading_or_chapter`
    - `scope_or_activity`
    - `labor_or_service`
    - `bundle_or_mixed_scope`
    - `unresolved`
8. `is_qualified BOOLEAN NOT NULL`
9. `is_market_monitorable BOOLEAN NULL`
10. `confidence TEXT NOT NULL`
  - `high`
  - `medium`
  - `low`
11. `rationale_summary TEXT NULL`
12. `evidence JSONB NOT NULL DEFAULT '[]'`
13. `retrieval_context JSONB NOT NULL DEFAULT '{}'`
14. `created_at TIMESTAMPTZ NOT NULL`

Purpose:
- preserve the agentic decision for every persisted shadow candidate
- keep optional linkage back to deterministic extracted rows when that provenance exists
- allow direct comparison against deterministic qualification assumptions
- provide span/eval-ready evidence for Arize

### Shadow Normalized Supply Records
Add a table for the agentic normalized candidates, for example:

`project_input_agentic_supplies`

Required fields:
1. `id UUID PK`
2. `agentic_run_id UUID NOT NULL`
3. `input_batch_id UUID NOT NULL`
4. `pipeline_variant TEXT NOT NULL`
5. `display_name TEXT NOT NULL`
6. `canonical_name TEXT NOT NULL`
7. `canonical_unit TEXT NULL`
8. `canonical_category TEXT NOT NULL`
9. `monitorability_status TEXT NOT NULL`
  - expected values:
    - `monitorable`
    - `not_monitorable`
    - `unresolved`
10. `market_mapping_status TEXT NOT NULL`
  - expected values:
    - `mapped`
    - `unmapped`
    - `rejected`
11. `quantity_total NUMERIC NULL`
12. `unit_price_reference NUMERIC NULL`
13. `total_price_reference NUMERIC NULL`
14. `source_document_ids JSONB NOT NULL DEFAULT '[]'`
15. `source_extracted_row_ids JSONB NOT NULL DEFAULT '[]'`
16. `deterministic_normalized_supply_id UUID NULL`
17. `confidence TEXT NOT NULL`
18. `rationale_summary TEXT NULL`
19. `retrieval_evidence JSONB NOT NULL DEFAULT '[]'`
20. `mapping_candidate JSONB NOT NULL DEFAULT '{}'`
21. `created_at TIMESTAMPTZ NOT NULL`

Purpose:
- represent the shadow candidate set that can be compared to deterministic normalized supplies
- allow many agentic candidates to point back to one deterministic normalized supply or bypass it when needed
- keep monitorability and mapping judgments first-class

### Explicit Row-To-Shadow-Supply Links
Add a join table, for example:

`project_input_agentic_row_links`

Required fields:
1. `id UUID PK`
2. `agentic_run_id UUID NOT NULL`
3. `extracted_row_id UUID NOT NULL`
4. `agentic_supply_id UUID NOT NULL`
5. `link_reason TEXT NOT NULL`
6. `created_at TIMESTAMPTZ NOT NULL`

Purpose:
- preserve exact many-to-many mapping from extracted rows to agentic supplies
- support provenance completeness metrics
- keep comparison with `project_input_row_normalizations` straightforward

### Optional Market Mapping Records
If mapping needs separate persistence, add:

`project_input_agentic_mappings`

Required fields:
1. `id UUID PK`
2. `agentic_run_id UUID NOT NULL`
3. `agentic_supply_id UUID NOT NULL`
4. `mapping_status TEXT NOT NULL`
5. `mapping_strategy TEXT NOT NULL`
  - `retrieval_catalog_match`
  - `keyword_fallback`
  - `manual_rule`
  - `unmapped`
6. `series_key TEXT NULL`
7. `series_id TEXT NULL`
8. `source_name TEXT NULL`
9. `source_url TEXT NULL`
10. `confidence TEXT NOT NULL`
11. `rationale_summary TEXT NULL`
12. `created_at TIMESTAMPTZ NOT NULL`

Purpose:
- keep mapping quality measurable independently from qualification quality
- make Arize mapping spans easier to verify against persisted data

## Read Contract
The backend should expose comparison-ready reads without changing the current project-create or run-trigger contracts.

Preferred additive read shape:
1. latest deterministic intake batch
2. latest agentic shadow run for that batch
3. row judgments summary
4. agentic supplies summary
5. deterministic vs agentic comparison metrics

Suggested debug endpoint shape:

`GET /projects/{project_id}/supply-selection-comparison`

Response sections:
1. `deterministic`
2. `agentic_shadow`
3. `comparison`
4. `provenance`

## Minimum V1 Comparison Fields
The first comparison payload should include:
1. `input_batch_id`
2. `deterministic.extracted_row_count`
3. `deterministic.normalized_supply_count`
4. `deterministic.mapped_supply_count`
5. `deterministic.unmapped_supply_count`
6. `agentic_shadow.qualified_supply_count`
7. `agentic_shadow.rejected_candidate_count`
8. `agentic_shadow.monitorable_supply_count`
9. `agentic_shadow.mapped_supply_count`
10. `agentic_shadow.unmapped_supply_count`
11. `comparison.coverage_delta`
12. `comparison.unresolved_subtotal_delta`
13. `comparison.false_critical_supply_delta`
14. `comparison.provenance_completeness_delta`

## Why This Contract
This contract keeps the implementation disciplined:
1. deterministic artifacts stay intact
2. agentic artifacts are additive and auditable
3. Arize spans can be matched to persisted entities
4. side-by-side comparison becomes a normal backend read, not a one-off notebook exercise

## Arize Comparison Design
The agentic shadow path should use the same span vocabulary as the deterministic path so both variants can be compared cleanly.

### Required spans
1. `document_ingest`
2. `row_extraction`
3. `supply_qualification`
4. `normalization`
5. `market_mapping`
6. `critical_supply_selection`
7. `forecast_and_risk`

### Required trace attributes
1. `pipeline.variant`
- `deterministic`
- `agentic_shadow`

2. `input_batch_id`
3. `project_id`
4. `document_count`
5. `extracted_row_count`
6. `qualified_supply_count`
7. `rejected_candidate_count`
8. `normalized_supply_count`
9. `mapped_supply_count`
10. `unmapped_supply_count`
11. `mapped_subtotal_budget`
12. `unmapped_subtotal_budget`

### Comparison questions in Arize
1. Does the agentic shadow path improve true-supply precision?
2. Does it reduce false critical supplies such as headings/scopes?
3. Does it improve market-monitorable coverage?
4. Does it reduce unresolved subtotal without forcing weak mappings?
5. Does it preserve provenance completeness?

## Evaluation Metrics
The comparison should be explicit and repeatable.

### Primary metrics
1. `qualified_supply_precision`
- Share of candidate supplies that are actually valid purchasable supplies.

2. `mapping_coverage_ratio`
- Mapped supply count divided by qualified supply count.

3. `mapped_subtotal_coverage_ratio`
- Budget subtotal covered by mapped supplies divided by subtotal for selected/qualified supplies.

4. `false_critical_supply_rate`
- Share of dashboard-exposed critical supplies that are actually headings/scopes/invalid items.

5. `provenance_completeness_rate`
- Share of selected supplies that remain traceable to source docs and extracted rows.

### Secondary metrics
1. `normalization_collapse_rate`
2. `unresolved_supply_count`
3. `unresolved_subtotal_budget`
4. `series_key_diversity`
5. `selection_stability`

## Implementation Phases
### Phase 1: Shadow interface and persistence
1. Define the agentic shadow artifact contract.
2. Add variant tagging and readback/debug support.
3. Keep the deterministic path as the production default.

### Phase 2: Qualification-first agentic pass
1. Start with the highest-value improvement:
  - heading rejection,
  - scope/activity rejection,
  - non-monitorable bundle rejection.
2. Persist:
  - qualified,
  - rejected,
  - unresolved classifications.

### Phase 3: Retrieval-assisted normalization and mapping
1. Add retrieval context for ambiguous or noisy items.
2. Improve canonical names and mapping suggestions.
3. Compare against deterministic outputs in Arize.

### Phase 4: Decision gate
1. Review side-by-side comparison on the benchmark projects.
2. Only consider default-path adoption if the agentic path shows better precision and coverage without provenance regression.

## Acceptance Criteria
1. A real project can produce both deterministic and `agentic_shadow` traces in Arize.
2. The shadow path preserves provenance to input batch, documents, and extracted rows.
3. Comparison metrics are visible for both variants on the same project/input set.
4. At least one benchmark project shows measurable improvement in qualification and mapping coverage.
5. The deterministic path remains the default until those improvements are demonstrated.

## Risks
1. Added complexity without measurable quality improvement.
2. Weak retrieval that only renames bad candidates instead of rejecting them.
3. Loss of provenance if shadow artifacts are not modeled carefully.
4. Overfitting the agentic path to one contractual example instead of generalizing across projects.

## Immediate Next Steps
1. Define the additive storage contract for `agentic_shadow` artifacts.
2. Pick the first 2-3 benchmark projects and freeze them for deterministic-vs-agentic comparison.
3. Implement a qualification-first shadow pass before richer mapping intelligence.
4. Route both variants into the same Arize project with explicit `pipeline.variant` tags.
