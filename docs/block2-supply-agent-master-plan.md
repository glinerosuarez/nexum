# Block 2 Master Plan: Supply Agent End-to-End

Date: 2026-06-02

## Summary
Block 2 is now split into two buckets:
1. A completed architecture/runtime foundation.
2. An active supply-intelligence bucket focused on improving the upstream inputs that drive supply-agent selection.

Completed architecture/runtime foundation:
1. End-to-end agent architecture across control plane, execution plane, persistence, and UI status semantics.
2. Cloud SQL-native data paths with no Supabase runtime dependency in the supply-agent execution path.
3. Reliable run outcomes with explicit failure semantics.
4. Production-grade observability and run lifecycle persistence, including target-selection provenance persisted in `supply_agent_runs.metadata`.

Current active bucket:
1. Contractual-document supply extraction quality.
2. Supply qualification, normalization, and deduplication before agent selection.
3. Provenance from source document -> parsed budget row -> normalized supply -> final selected supply -> market mapping.
4. Backend/read-model support needed to inspect those inputs later.
5. Coverage and monitorability of critical supplies as first-class product outputs.
6. Arize-backed tracing and evaluation of the supply-intelligence improvement loop.
7. A shadow agentic retrieval path that can be compared against the deterministic baseline before default-path replacement.

Success criteria:
1. The architecture/runtime foundation remains stable and closed except for bug fixes.
2. Upstream selection inputs become inspectable and traceable from source documents through selected supplies.
3. The product can credibly position itself as an agentic supply-intelligence pipeline that converts contractual documents into traceable, market-monitorable critical supplies.
4. Arize can demonstrate an improvement loop comparing deterministic and agentic variants on the same supply-intelligence workflow.

## Implementation Changes
1. **Completed architecture/runtime foundation**
- This bucket is delivered and closed for new scope.
- Delivered items:
  - strict control-plane and execution-plane boundaries,
  - canonical run state machine and explicit failure semantics,
  - `SUPPLY_AGENT_MCP_REQUIRED=true` rollout in hosted runtime,
  - Cloud SQL-native persistence/read model for the supply-agent path,
  - run lifecycle and target-selection provenance persisted in `supply_agent_runs.metadata`,
  - explicit UI-consumable status semantics for `not_started|running|completed|failed`.
- This bucket now receives bug fixes only, not new feature scope.

2. **Active bucket: supply-intelligence input quality and preparation**
- Improve contractual-document parsing so supply-like rows are extracted with better fidelity before they become coarse budget inputs.
- Separate true purchasable supplies from headings, scopes, activities, and mixed contractual bundles before they become monitorable candidates.
- Preserve source-document references for each extracted row and capture extraction confidence or parsing notes where available.
- Normalize names, units, and categories before rows enter selection inputs.
- Deduplicate materially equivalent supplies with deterministic grouping rules so downstream selection is stable.
- Persist provenance linking:
  - source document,
  - extracted row,
  - normalized supply candidate,
  - final selected supply,
  - market/source mapping outcome.
- Standardize selection-input artifacts so downstream orchestration consumes a prepared input set rather than loosely aggregated budget rows.
- Treat market-monitorability and mapping coverage as product metrics, not only as downstream technical side effects.

3. **Backend/read-model support for input inspection**
- Expand internal persistence/read contracts to store and read:
  - extracted supply rows,
  - normalization decisions,
  - provenance references,
  - selected-input artifacts.
- Expose these artifacts through backend read paths for debugging and later UI use.
- Keep current `POST /agent/run-supply-cost` trigger behavior unchanged unless additive read-only fields are strictly needed for later inspection.

4. **Arize tracing and evaluation workstream**
- Instrument the supply-intelligence pipeline as a sequence of traceable spans:
  - document ingest,
  - row extraction,
  - supply qualification,
  - normalization,
  - market mapping,
  - critical-supply selection,
  - downstream forecast/risk.
- Log deterministic quality and coverage metrics on those spans.
- Define Arize evaluations that score:
  - true-supply qualification,
  - heading/scope rejection,
  - market-monitorability,
  - mapping quality,
  - provenance completeness.
- Use Arize to compare deterministic vs agentic retrieval variants against the stored baseline before default-path replacement.

5. **Shadow agentic retrieval workstream**
- Implement the next retrieval evolution as an additive shadow pipeline rather than an immediate replacement.
- Reuse the same persisted contractual-input artifacts so deterministic and agentic variants are comparable on the same project/input batch.
- Preserve provenance and emit the same span vocabulary in Arize with an explicit `pipeline.variant` tag.
- Keep the deterministic path as the default until the shadow path demonstrates better qualification, coverage, and dashboard precision.
- Track the detailed implementation plan in:
  - [block2-subplan-agentic-retrieval-shadow-pipeline.md](/Users/gabriel.linero/repos/hack/gc_ra_hack/baqhack/Nexum-IA/docs/block2-subplan-agentic-retrieval-shadow-pipeline.md)
6. **Orchestrator and downstream behavior constraints**
- Keep current forecasting and risk computation behavior functionally the same unless better inputs naturally improve outputs.
- Keep deterministic orchestration expectations intact:
  - target selection remains stable for the same prepared inputs,
  - `run_id` correlation remains invariant across web/API/MCP/logs,
  - explicit terminal failure semantics remain unchanged.

7. **Deferred follow-up work**
- User-facing explainability of "why these supplies" is not part of this bucket.
- A richer explanation panel can follow after the upstream input model is trustworthy and inspectable.
- Broader UI copy/experience changes remain outside this bucket unless minimal debug/read exposure is needed.
- Deterministic extraction/normalization is now the baseline, not the end state:
  - the current deterministic parser can still promote chapter headers, scopes, and mixed activity rows into selected supplies,
  - a retrieval-assisted or agentic retrieval pipeline should be evaluated as the next main improvement track,
  - the deterministic baseline must remain stored so the future pipeline is judged by measurable gains in qualification, coverage, and provenance.
- Repository consolidation status:
  - `Nexum-IA` is now the intended monorepo home for the product.
  - the runtime/backend code required for current delivery is carried under `mcp-fca-hackaton/` inside this repo,
  - future implementation should treat this repo as the canonical source of truth and retire split-brain assumptions about duplicate backend trees.

## Public Interfaces / Contract Changes
- The existing web-trigger route contract stays unchanged unless strictly required for additive read-only inspection fields.
- Internal/backend contracts may expand to persist and read:
  - extracted supply rows,
  - normalization decisions,
  - provenance references,
  - selected-input artifacts.
- Existing run status semantics remain in force:
  - terminal status must distinguish `completed`, `failed`, and `not_started`.
- Prefer additive backend/read-model fields over behavioral changes to the run trigger API.

## Test Plan
1. **Parsing tests**
- The same contractual document yields stable extracted supply rows.
- Malformed or partial documents degrade explicitly rather than silently collapsing rows.

2. **Normalization tests**
- Duplicate or materially similar rows collapse deterministically.
- Unit, name, and category normalization is reproducible.
- True-supply qualification rejects headings/scopes more reliably than the deterministic baseline.

3. **Provenance and persistence tests**
- Each selected supply can be traced back to upstream parsed rows.
- Persisted provenance survives round-trip readback.
- Read models expose normalized selection-input artifacts without changing run-trigger behavior.

4. **Tracing and evaluation tests**
- Arize traces exist for at least one real project flow.
- Pipeline-stage spans carry expected supply-intelligence attributes.
- Deterministic vs agentic comparison metrics can be logged and reviewed.

5. **End-to-end tests**
- Create project -> upload/analyze docs -> run supply agent.
- Verify selected-input artifacts are richer and explainable from source material.
- Compare mapping coverage and false-positive rate against the stored deterministic baseline.
- Confirm downstream counters still work and no regression is introduced in run lifecycle/status.

6. **Acceptance gates for Block 2**
- Architecture/runtime foundation is complete and remains closed except for bug fixes.
- No Supabase runtime dependency remains in the supply-agent execution path.
- `SUPPLY_AGENT_MCP_REQUIRED=true` remains active in hosted environments.
- Input-quality artifacts are deterministic, persisted, and inspectable through backend/read-model paths.
- Arize is integrated as the improvement loop, not just generic observability.

## Assumptions and Defaults
- The architecture/runtime foundation for Block 2 is complete and closed for new scope.
- The active Block 2 bucket is supply intelligence upstream of forecasting: parsing, qualification, normalization, provenance, and monitorability.
- MCP remains the tool-host protocol boundary, while `nexum-api` remains control-plane API for the web app.
- User-facing explanation UI is deferred until after the input model is trustworthy.
- Existing forecasting and risk computation remain functionally the same unless better inputs naturally improve outputs.
- Spanish UI default and English UI rollout remain Block 3, except any minimal debug/read exposure needed to support the current bucket.
