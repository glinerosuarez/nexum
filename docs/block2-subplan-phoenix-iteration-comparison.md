# Block 2 Subplan: Phoenix Iteration Comparison Loop

Date: 2026-06-07

## Summary
This subplan defines the next implementation sequence after the first end-to-end `agentic_shadow` pipeline, unified shadow root trace, and Phoenix Cloud instrumentation are live.

The purpose of this workstream is not to add more tracing for its own sake. The purpose is to make iteration quality visible and comparable across pipeline versions so the hackathon story can show measurable improvement, not just one-off successful traces.

Current product framing remains:

`an agentic supply-intelligence pipeline that converts contractual documents into traceable, market-monitorable critical supplies`

Phoenix is now the comparison and improvement surface for that pipeline.

## Current Status
The following is already implemented and deployed:

1. Deterministic supply-agent tracing in Phoenix with root trace:
  - `material_price_forecast`
2. Agentic shadow tracing in Phoenix with root trace:
  - `agentic_shadow_run`
3. Unified shadow run endpoint:
  - `POST /project-input-batches/{input_batch_id}/agentic-shadow-runs/run`
4. Shared comparison metadata on traces:
  - `pipeline.variant`
  - `pipeline.version`
  - `benchmark.dataset`
  - `benchmark.instance_id`
  - `session.id`
  - `project.id`
  - `input_batch.id`
5. Persisted Cloud SQL artifacts for:
  - shadow candidates
  - row judgments
  - shadow supplies
  - row links
  - shadow mappings
6. Persisted observability metadata on shadow runs, including `trace_id` when tracing is enabled.

### Progress Update: 2026-06-09
Step 1 is now verified against the live Phoenix project, not only by screenshots.

Verified benchmark example:
- `project.id = 9722e72c-1041-4f11-bb3e-aabed4e66502`
- `input_batch.id = 388cc3f5-3b19-442a-87f9-b4e05b3c0a66`
- `agentic_shadow` trace version observed in Phoenix: `nexum-api-00039-hgz`

What was verified in Phoenix:
1. Filtering by `project.id` exposed both trace families for the same intake:
  - `agentic_shadow_run`
  - `material_price_forecast`
2. `session.id = input_batch.id` is present on both root traces.
3. The qualitative sampling payloads added for agent engineering are visible on:
  - `extract_shadow_candidates`
  - `shadow_qualification`
  - `shadow_normalization`
  - `shadow_market_mapping`

What changed after verification:
1. The qualitative JSON payloads were kept as span attributes.
2. Mirrored span events were removed because they duplicated the same payloads and added Phoenix noise.

Current execution point:
1. `Step 1` can be treated as complete and verified.
2. Active implementation focus moves to `Step 2` mapping coverage improvement.
3. The preferred Step 2 order is:
  - inherit deterministic configured source mappings when a shadow supply already links to a deterministic normalized supply
  - improve category-aware fallback routing into the currently supported market families
  - keep headings/scopes rejected upstream instead of inflating coverage with bad mappings

### Progress Update: 2026-06-09 Benchmark Replay
Step 2 was validated on a fresh live replay for:

- `project.id = 612d46b3-853b-4936-82ad-d1fa6e205903`
- `input_batch.id = 9bd75aa6-b41c-4d55-8f3b-256e56b92c8a`
- successful Phoenix trace: `89d9064bf72192329a7adb12bd280fe2`
- successful `agentic_run_id = 209c6155-36af-4c73-ac00-e54f8ce473c3`

Observed benchmark improvement versus the earlier baseline run:
1. `mapped_shadow_supply_count` improved from `5` to `38`.
2. `unmapped_shadow_supply_count` dropped from `46` to `13`.

Follow-up correction made after inspecting the Phoenix qualitative samples:
1. category-aware fallback introduced some false positives in the `lumber` family
2. plumbing rows with `CPVC` were incorrectly treated as openings/carpentry because `pvc` was included as a lumber keyword
3. `compuerta` was incorrectly matching the `puerta` opening hint because the old matcher allowed raw substring hits

Current mitigation:
1. remove `pvc` from the `lumber` fallback hint family
2. require exact token matches for single-word hints and bounded phrase matches for multi-word hints
3. keep real opening matches such as `puerta ... MDF` valid

### Progress Update: 2026-06-09 Semantic Retrieval Readout
Latest Phoenix replay on `nexum-api-00045-867` confirmed a more important product insight:

1. the hackathon value is retrieval recall plus semantic supply identification
2. coarse forecast-family fallback should stay secondary
3. if a row is semantically identified as `valve`, `siphon`, or `pipe_network`, that signal is more useful than forcing an untrustworthy family forecast

Current implementation direction:
1. preserve `supply_class` in shadow outputs and Phoenix samples
2. keep `series_key` separate as an optional downstream market-family mapping
3. treat unresolved forecast mapping as an explicit gap instead of hiding it with coarse fallback inflation

### Progress Update: 2026-06-09 Semantic Gap Closure
Latest Phoenix replay on `nexum-api-00046-n4c` for:

- `project.id = 5e07d6ed-ac68-4587-a84a-692ba791071b`
- `agentic_shadow` trace: `c552417db7cb22dc9bcb420be00eed37`

confirmed that the semantic layer is now live in sampled shadow mappings:

1. `mapped_shadow_supply_count = 40`
2. `unmapped_shadow_supply_count = 11`
3. sampled mapped and unmapped payloads now show `supply_class` alongside `series_key`

Phoenix also exposed the next semantic precision gap:

1. some bathroom/metal accessory rows were still reaching Phoenix as mapped supplies with `supply_class = null`
2. representative examples included `Barra de seguridad...` and `Portarollo metálico...`

Follow-up refinement made after that trace review:

1. add explicit semantic classes for bathroom accessory fixtures:
  - `grab_bar`
  - `paper_holder`
  - `soap_dish`
  - `towel_bar`
2. keep those items independently classifiable even when their downstream fallback family remains coarse
3. preserve the Phoenix comparison story:
  - retrieval meaning gets sharper
  - forecast-family coarseness stays visible instead of being hidden

Next refinement identified by the same Phoenix replay:

1. a sampled mapped row for lighting control still showed `supply_class = null`
2. representative example:
  - `Salida de control de iluminación ... sensor 360 ... sensor de techo ... caja 2400 galvanizada`

Follow-up correction:

1. add explicit `lighting_control` semantic classification
2. keep the downstream family mapping coarse (`steel`) while improving the supply-level meaning shown in Phoenix

Latest Phoenix-guided refinement after `nexum-api-00048-pj4`:

1. one of the remaining sampled `supply_class = null` rows was `S/I (2) ganchos metálicos evolution por habitación...`
2. it was still landing as `series_key = steel` without a semantic label

Follow-up correction:

1. add explicit `hook` semantic classification for bathroom accessory rows such as `gancho`, `colgador`, and `percha`
2. keep those rows separately intelligible in Phoenix without pretending the downstream market model is more granular than it is

Latest Phoenix-guided refinement after `nexum-api-00049-2fw`:

1. one of the remaining sampled `supply_class = null` rows was `S/I Muro en mampostería (Bloque 15 cm)...`
2. it was already mapping into `series_key = cement`, but without a semantic wall/masonry label

Follow-up correction:

1. add explicit `masonry_wall` semantic classification for rows such as `muro`, `mampostería`, and `bloque`
2. keep structural wall rows distinguishable from finish rows like `wall_finish` in Phoenix

Latest Phoenix-guided refinement after `nexum-api-00050-xtw`:

1. a sampled window row `Ventana en PVC Blanco con Rejillas...` was surfacing as `grate`
2. a sampled electrical partial/cableado row from `tableros` was surfacing as `tile_finish` because of `piso 5`

Follow-up correction:

1. make `window` win over incidental `rejilla` keywords on window rows
2. add explicit `electrical_feeder` semantic classification for cableado/awg/ducto/tableros partial rows
3. narrow `tile_finish` so floor numbering like `piso 5` does not hijack electrical rows

## Problem Statement
Even though tracing is live, the current comparison story still has operational friction and quality gaps:

1. Humans cannot yet discover and compare both trace families as easily as they should in Phoenix.
2. Mapping coverage is still weak enough that the demo can show “agentic extraction worked” while still failing to produce enough market-monitorable supplies.
3. Shadow supplies do not yet preserve strong deterministic normalized linkage, which weakens comparison at the supply level.
4. Phoenix has traces, but it does not yet have a first-class benchmark/evaluation view that clearly shows iteration-over-iteration improvement.

## Ordered Next Steps
The user-selected implementation order for this workstream is:

1. Joinability and discoverability improvements in Phoenix.
2. Mapping coverage improvements before deeper retrieval work.
3. Deterministic linkage improvements at the shadow-supply layer.
4. First real Phoenix comparison dashboards/evals.

This ordering is intentional. The team wants:
- better comparison ergonomics first,
- then better output usefulness,
- then stronger cross-variant grounding,
- then formalized benchmark views.

## Execution Model
This workstream is not fully sequential.

The intended execution model is:
1. `Step 1` should happen first.
2. After `Step 1` is stable enough, `Step 2` and `Step 3` can run in parallel.
3. `Step 4` should happen after the outputs and metadata from `Step 2` and `Step 3` are stable enough to compare.

In short:
1. `joinability` first,
2. `mapping coverage` and `deterministic linkage` in parallel,
3. `Phoenix dashboards/evals` last.

### Why only Step 1 must come first
- Without reliable joinability, later improvements are harder to verify and harder to compare across trace families.
- The trace-discovery ergonomics need to be stable before the team invests in benchmark and evaluation views.

### Why Step 2 and Step 3 can run in parallel
- `mapping coverage` focuses on:
  - monitorability logic,
  - mapping hints,
  - category-aware source resolution,
  - mapped vs unmapped output quality.
- `deterministic linkage` focuses on:
  - preserving supply-level links back to deterministic normalized supplies,
  - improving provenance and comparison auditability,
  - increasing `linked_to_deterministic_supply_count`.

These concerns are related, but neither is a hard prerequisite for the other once trace joinability is in place.

### Why Step 4 should remain last
- Saved Phoenix comparisons and eval views should be built on top of relatively stable metric names, trace attributes, and supply-level outputs.
- If dashboards/evals are built too early, they will churn while the underlying comparison signals are still moving.

## Step 1: Improve Joinability In Phoenix
### Goal
Make it easy for humans to find and compare the relevant traces for the same project/intake without reconstructing IDs manually.

### Why this comes first
- The pipeline can already emit deterministic and agentic traces.
- The current issue is discoverability and comparison ergonomics.
- If this remains awkward, the quality story will be hard to demonstrate even when the underlying pipeline improves.

### Required outcomes
1. A single predictable comparison key must exist for both trace families.
2. A project-level lookup path must also work in Phoenix without requiring agents or judges to know internal storage timing details.
3. The same project/intake should be discoverable through:
  - `project.id`
  - `input_batch.id`
  - `session.id`

### Implementation direction
1. Keep `input_batch.id` as the canonical join key.
2. Ensure both trace families emit:
  - `input_batch.id`
  - `session.id = input_batch.id`
  - `project.id`
3. If a trace is created before the project binding is complete, add a post-binding enrichment/update path so the final Phoenix-visible metadata still includes `project.id`.
4. Avoid relying on users knowing the internal distinction between project creation time and batch-analysis time.

### Verification
For one fresh project:
1. filtering by `project.id` should show both:
  - `agentic_shadow_run`
  - `material_price_forecast`
2. filtering by `input_batch.id` should show the same two traces
3. filtering by `session.id` should also show the same two traces

## Step 2: Improve Mapping Coverage
### Goal
Increase the number of qualified shadow supplies that become truly market-monitorable and reduce the unresolved subtotal.

### Why this comes second
- The current blocker to a stronger demo is not only extraction quality.
- The pipeline already produces many qualified shadow supplies, but too few map to usable market/source signals.
- Improving mapping coverage makes the agentic path visibly more valuable before deeper normalization-linkage refinements.

### Required outcomes
1. Increase `mapped_shadow_supply_count`.
2. Decrease `unmapped_shadow_supply_count`.
3. Decrease unmapped subtotal budget exposure.
4. Preserve rejection of obvious headings/scopes; do not inflate mapping coverage by forcing bad mappings.

### Implementation direction
1. Improve monitorability judgment rules and prompts.
2. Expand mapping hints beyond the current narrow source-family vocabulary.
3. Add better category-aware mapping logic for:
  - electrical systems
  - finishes
  - sanitary/plumbing systems
  - HVAC systems
4. Preserve mapping confidence and rationale in persisted shadow mappings.

### Verification
On the frozen benchmark projects:
1. mapping coverage ratio improves over the current baseline
2. mapped subtotal budget increases without obvious false-positive mappings
3. Phoenix `shadow_market_mapping` spans reflect the change clearly

## Step 3: Improve Deterministic Linkage At The Shadow Supply Layer
### Goal
Preserve and expose stronger supply-level links between:
- shadow candidates/supplies
- deterministic extracted rows
- deterministic normalized supplies

### Why this comes third
- Candidate-level matching already exists.
- The more important immediate product win is mapping coverage.
- After mapping improves, supply-level comparison becomes more meaningful and more important for auditability.

### Required outcomes
1. Increase `linked_to_deterministic_supply_count`.
2. Persist deterministic normalized supply references on shadow supplies when a credible match exists.
3. Make comparison possible at the normalized-supply level, not only at the candidate level.

### Implementation direction
1. Improve shadow grouping so supply-level canonical records retain:
  - `deterministic_normalized_supply_id`
  - deterministic normalization key where applicable
2. Preserve one-to-many provenance links through `project_input_agentic_row_links`.
3. Keep unmatched agentic-only supplies valid; do not require linkage for all shadow supplies.

### Verification
1. A fresh run should show non-zero `linked_to_deterministic_supply_count` in Phoenix.
2. Comparison endpoints should expose matched vs unmatched shadow supplies explicitly.
3. Persisted row links should remain traceable back to source rows/documents.

## Step 4: Add First Real Phoenix Comparison Dashboards And Evals
### Goal
Turn Phoenix from a trace viewer into an iteration-comparison surface for the hackathon.

### Why this comes fourth
- Phoenix traces are already live.
- Comparison metadata is already in place.
- The value of dashboards/evals is much higher once joinability and output quality are improved.

### Required outcomes
1. A frozen benchmark set is used consistently.
2. Deterministic and agentic runs are comparable by:
  - pipeline version
  - benchmark instance
  - input batch
3. At least one judge-friendly comparison view exists.

### First dashboard/eval package
1. Extraction/qualification coverage:
  - candidate count
  - qualified supply count
  - rejected candidate count
2. Mapping usefulness:
  - mapped supply count
  - unmapped supply count
  - coverage ratio
  - mapped subtotal budget
  - unmapped subtotal budget
3. Comparison labels:
  - `pipeline.variant`
  - `pipeline.version`
  - `benchmark.dataset`
  - `benchmark.instance_id`
4. First evaluation questions:
  - Is this a true supply?
  - Is this market-monitorable?
  - Is this mapping plausible?
  - Is provenance complete?

### Verification
1. Phoenix can show deterministic vs agentic traces for the same benchmark instance.
2. A dashboard or saved query makes the improvement visible without manual row-by-row inspection.
3. The team can point to measurable iteration progress in the hackathon pitch.

## Benchmark Discipline
This workstream must use a stable benchmark set. Do not validate improvements only on ad hoc single projects.

Minimum benchmark discipline:
1. Freeze a small benchmark set of representative contractual projects.
2. Re-run the same benchmark set after each material iteration.
3. Store deterministic baseline metrics and updated agentic metrics.
4. Treat regressions as real even if one manually inspected project looks better.

## Recommended Immediate Task Breakdown
For the next agent picking this up, use this execution sequence:

1. Joinability fix
- verify both trace families are discoverable by `project.id`, `input_batch.id`, and `session.id`
- add post-binding trace enrichment if needed

2. Parallel Track A: Mapping coverage improvement
- focus on `shadow_market_mapping`
- expand monitorability and mapping quality without forcing false positives

3. Parallel Track B: Deterministic linkage improvement
- propagate supply-level deterministic normalized links into shadow supplies

4. Phoenix comparison package
- save benchmark filters/queries
- define first evaluations and comparison views

### Coordination rule for parallel work
If `Step 2` and `Step 3` are split across agents, they should avoid making incompatible changes to:
1. root trace metadata names,
2. comparison attribute keys,
3. persisted supply identity fields.

Those shared contracts should stay stable while the two tracks progress in parallel.

## Acceptance Criteria
This workstream is complete enough for the hackathon when:

1. A fresh project can be found in Phoenix by both `project.id` and `input_batch.id`.
2. The same intake shows both:
  - `agentic_shadow_run`
  - `material_price_forecast`
3. Shadow mapping coverage is measurably better than the current live baseline.
4. Shadow supplies preserve deterministic linkage where a credible match exists.
5. Phoenix can show an iteration-over-iteration comparison on the same benchmark set without manual trace archaeology.
