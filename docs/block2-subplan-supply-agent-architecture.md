# Block 2 Subplan: Supply Agent Architecture (Control Plane + Execution Plane)

Date: 2026-05-31

## Closeout Decision

This first Block 2 architecture bucket is considered complete as of 2026-06-02.

Delivered and verified:
- `nexum-api` is the single control-plane entrypoint for web-triggered supply-agent runs.
- MCP is the active execution-plane boundary in hosted runtime.
- Live runs persist terminal lifecycle state and stage history in Cloud SQL.
- `x-run-id` / `run_id` correlation works across web, API, MCP, and DB.
- Hosted runtime is operating with `SUPPLY_AGENT_MCP_REQUIRED=true` and a real MCP endpoint.
- UI read paths distinguish `not_started|running|completed|failed`.
- Run provenance now persists selected supplies and source mappings in `supply_agent_runs.metadata`.

Hosted verification included:
- authenticated create-project -> run-supply-agent smoke,
- explicit failure-path verification during rollout,
- direct Cloud SQL inspection of persisted run metadata,
- live UI validation of dashboard/agent status semantics.

## Summary
Design and implement the architecture block for the supply agent so runtime behavior is deterministic, observable, and UI-consumable.

This subplan focuses on architecture boundaries and run lifecycle contracts (not full tool internals or UI copy rollout).

Target outcome:
1. `nexum-api` remains the single control-plane entrypoint for web-triggered runs.
2. MCP remains the execution-plane tool host boundary.
3. Each run follows a strict state machine with persisted and queryable stage/status.
4. Failures are explicit and correlated by `run_id` across web, API, MCP, and DB.

## Implementation Changes
1. **Define architecture boundaries and responsibilities**
- Control plane (`nexum-api`):
  - authenticate/authorize request,
  - validate payload,
  - create/initialize run context,
  - invoke execution plane,
  - map execution result to stable API response.
- Execution plane (MCP tool runtime):
  - execute stage pipeline,
  - return structured stage/counter/result envelope,
  - surface deterministic error class on failure.
- Persistence plane (Cloud SQL):
  - record run lifecycle state transitions and terminal outcome,
  - provide snapshot/read models consumed by dashboard endpoints.

2. **Establish canonical run state machine**
- Canonical states:
  - `accepted`
  - `selecting_targets`
  - `fetching_market_data`
  - `forecasting`
  - `computing_risk`
  - `persisting`
  - terminal: `completed` or `failed`
- Rules:
  - single forward-only transitions (no state regression),
  - terminal states immutable except metadata enrichment,
  - every state write includes timestamp and `run_id`.
- Failure rule:
  - any stage exception transitions run to `failed` with `error_class` and `error_summary`.

3. **Standardize inter-service execution contract**
- `POST /agent/run-supply-cost` request remains unchanged (`project_id`, `mode`, `dry_run`, optional tuning fields).
- Execution envelope returned from MCP to API must include:
  - `run_id`,
  - `status` (terminal),
  - `stage` (last stage reached),
  - `counters` (`supplies_processed`, `errors`, `forecasts_written`, `alerts_created`),
  - `diagnostics` (`error_class`, `error_summary`, optional stage timings).
- API response to web keeps existing keys but is architecture-strict:
  - success: `ok=true`, `phase=phase2_remote_mcp`, counters, `run_id`,
  - failure: non-2xx with explicit failure detail (no skeleton-success fallback path).

4. **Run correlation and observability architecture**
- Correlation IDs:
  - preserve/emit `run_id` for all logs and DB records,
  - propagate `x-run-id` between web proxy, API, and MCP calls.
- Structured events at minimum:
  - `run.accepted`, `run.stage_started`, `run.stage_completed`, `run.failed`, `run.completed`.
- Required fields per event:
  - `run_id`, `project_id`, `profile_id`, `stage`, `status`, `error_class` (if any), `duration_ms` (if terminal/stage complete).

5. **Architecture-driven UI read contract**
- Dashboard/agent view reads must be able to distinguish:
  - `not_started` (no run),
  - `running` (non-terminal state),
  - `completed`,
  - `failed`.
- Snapshot read model must expose at least:
  - `last_run_status`, `last_run_started_at`, `last_run_finished_at`,
  - counter fields,
  - `error_summary` for failed runs.
- Remove ambiguity where zero counters can be interpreted as success without run completion evidence.
- Persist enough run provenance to explain target selection:
  - selected supply ids/names,
  - source mappings used for each selected supply,
  - optional upstream references to parsed contractual/budget rows that produced those supplies.

## Public Interfaces / Contract Changes
- No route changes:
  - keep `POST /agent/run-supply-cost` and existing web proxy route.
- Behavioral contract change:
  - remove fallback “ok with zero counters” semantics in required mode.
- Execution envelope contract (MCP -> API):
  - require stable fields (`run_id`, `status`, `stage`, counters, diagnostics).
- Read-model contract (API -> UI):
  - expose explicit status model supporting `not_started|running|completed|failed`.

## Test Plan
1. **State machine tests**
- Valid transition sequence from `accepted` to terminal states.
- Invalid transition attempts are rejected or ignored deterministically.
- Terminal failure includes `error_class` and `error_summary`.

2. **Control-plane contract tests**
- Authorized trigger returns `run_id` and stage/counter-compatible response.
- Unauthorized project access is rejected before execution.
- Execution-plane exception yields explicit API error (no success fallback).

3. **Correlation/observability tests**
- `run_id` consistency across API logs, MCP logs, and persisted records.
- Required lifecycle events emitted for success and failure runs.

4. **UI-read contract tests**
- Snapshot endpoint returns distinct states for not-started/running/completed/failed.
- Failed run exposes error summary and does not present as completed.

## Assumptions and Defaults
- MCP remains the execution-plane protocol boundary for Block 2.
- Cloud SQL schema supports run lifecycle persistence needed by this state machine.
- `SUPPLY_AGENT_MCP_REQUIRED=true` is the default enforcement target for this architecture.
- Toolset details (specific data-source tools and forecasting internals) are handled in separate subplans.
- Contractual-document parsing quality and budget-row normalization remain a dependent workstream and must improve so target selection is explainable from source documents, not only from aggregated budget rows.

## Explicitly Deferred From This Bucket

The following items are intentionally not blockers for closing this architecture subplan:

- contractual-document parsing quality and normalization of extracted supply rows,
- richer UI explanation of why a specific supply was selected,
- row-level artifact/readback polish for observations and forecasts beyond the current dashboard contract,
- broader non-supply-agent runtime cleanup outside the Block 2 execution path.
