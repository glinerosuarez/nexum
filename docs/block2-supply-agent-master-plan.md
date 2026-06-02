# Block 2 Master Plan: Supply Agent End-to-End

Date: 2026-05-31

## Summary
Implement Block 2 as the complete Supply Agent system, not just MCP wiring.

This block delivers:
1. End-to-end agent architecture (planner/executor/tooling/persistence/UI status).
2. Cloud SQL-native data paths (no Supabase runtime dependency).
3. Reliable run outcomes with explicit failure semantics.
4. Production-grade observability and evaluation signals for downstream Arize work.

Success criteria:
1. A user can trigger a run from UI, the agent executes multi-step flow, results persist, and dashboard shows non-ambiguous outcomes.
2. Failures are explicit (no false-success skeleton), diagnosable, and traceable by `run_id`.

## Implementation Changes
1. **Supply Agent system architecture (control plane + execution plane)**
- Define a clear execution state machine for each run:
  - `accepted -> selecting_targets -> fetching_market_data -> forecasting -> computing_risk -> persisting -> completed|failed`.
- Keep `nexum-api` as control plane entrypoint (`POST /agent/run-supply-cost`) and MCP as execution tool plane.
- Add run-stage payload contract so UI can render true run status (not infer from zero counters alone).

2. **Toolset design and composition (agent capability set)**
- Formalize tool groups the supply agent can use:
  - project/supply context reads,
  - market data retrieval (proxy series/scrape sources),
  - forecast computation,
  - risk/overrun computation,
  - persistence/readback tools for run artifacts.
- Standardize tool I/O schemas so orchestrator can chain outputs deterministically.
- Preserve current MCP tool endpoint shape, but normalize structured outputs for all core tools (status, counters, diagnostics, artifacts).
- Add explicit provenance requirements for target selection inputs:
  - preserve which contractual/budget source rows produced each selected supply,
  - persist selected supply ids/names/source mappings in run artifacts,
  - make post-run explanations possible without reconstructing selection from raw budget tables.

3. **Orchestrator design (agent logic, policy, and fallback behavior)**
- Implement deterministic orchestration policy for Block 2:
  - target selection policy from project budget snapshot + optional `material_queries`,
  - bounded retries/timeouts per step,
  - per-step failure handling and terminal classification.
- Remove “success fallback with empty counters” behavior in required mode.
- Enforce `SUPPLY_AGENT_MCP_REQUIRED=true` immediately in all environments.
- Keep `run_id` invariant across web/API/MCP/logs.

4. **Data-layer migration for all supply-agent paths**
- Migrate MCP internals and supply-agent persistence/read logic to Cloud SQL-native repositories:
  - `supply_agent_runs`,
  - observations,
  - forecasts,
  - alerts,
  - snapshot-read paths consumed by dashboard/API.
- Remove Supabase-runtime assumptions in tool auth/data access.
- Align identity checks to Firebase-profile mapping and membership authorization model.
- Add a follow-up parsing-hardening item for upstream budget creation:
  - improve contractual-document parsing so extracted supplies are less coarse,
  - normalize duplicate/materially-similar line items before supply-agent selection,
  - surface extraction confidence/provenance for debug and evaluator explanation.

5. **UI behavior and agent experience**
- Add explicit run outcome states in dashboard/agent panel:
  - running, completed-with-metrics, failed-with-reason, no-run-yet.
- Prevent ambiguous “Sin corrida” presentation after failed execution.
- Expose key agent outputs consistently:
  - supplies targeted,
  - fetch success/failure,
  - forecast points,
  - alerts,
  - projected deviation.

6. **Observability, diagnostics, and evaluation scaffolding**
- Emit structured events per stage with shared `run_id` and error class.
- Add normalized failure taxonomy:
  - `authz_failed`, `input_invalid`, `market_data_unavailable`, `forecast_failed`, `persist_failed`, `mcp_transport_failed`.
- Capture per-run artifact bundle for evidence/debug:
  - inputs, selected targets, tool call summaries, counters, terminal status.
- Produce evaluation-ready metrics (success rate, stage latency, non-zero output rate) for Arize integration in Block 4.

7. **Operational rollout and hardening**
- Deploy MCP and API revisions with versioned configs and explicit env contract.
- Validate service dependencies/health before accepting runs.
- Add runbook for cold-start, timeout, and upstream data-source degradation scenarios.

## Public Interfaces / Contract Changes
- `POST /agent/run-supply-cost` keeps same endpoint and core response fields but with stricter behavior:
  - MCP failure returns explicit error (no fake success path).
- Add/standardize run status semantics for UI consumption:
  - terminal status must distinguish `completed`, `failed`, and `not_started`.
- Internal tool contracts become schema-stable for orchestrator chaining (no backend endpoint path changes required for frontend).

## Test Plan
1. **Unit tests (agent logic + tools)**
- Target-supply selection correctness with and without `material_queries`.
- Stage transition and retry/timeout policy behavior.
- Risk computation correctness from forecast outputs.

2. **Repository/integration tests (Cloud SQL)**
- Persistence and readback for runs/observations/forecasts/alerts/snapshots.
- Authz enforcement for membership and cross-project isolation.

3. **API + MCP integration tests**
- Success path: returns expected counters and `run_id`.
- Failure path: returns explicit errors under MCP/tool/data failures.
- Correlation path: `run_id` present and consistent across API and MCP logs.

4. **E2E product smoke**
- Create project -> run supply agent -> see updated dashboard metrics and status.
- Negative E2E: induce market/MCP failure -> user sees actionable failure state, not zeroed success.
- Repeatability: two consecutive runs on same project produce stable, explainable outputs.

5. **Acceptance gates for Block 2 completion**
- No Supabase runtime dependency in supply-agent execution path.
- `SUPPLY_AGENT_MCP_REQUIRED=true` active in all environments.
- Non-ambiguous UI run state and persisted outcomes verified in hosted environment.

## Assumptions and Defaults
- Block 2 includes full supply-agent architecture and full MCP data-layer migration to Cloud SQL.
- MCP remains the tool-host protocol boundary, while `nexum-api` remains control-plane API for the web app.
- Spanish UI default and English UI rollout remain Block 3, except any minimal UX text needed to represent Block 2 failure states clearly.
