# Block 1 Closeout and Supply-Agent Next Bucket

Date: 2026-05-31

## Block 1 closeout decision

Block 1 is considered complete for migration scope:

- Next.js frontend runs on Cloud Run (`nexum-web`).
- Backend API runs on Cloud Run (`nexum-api`).
- Firebase auth + project-level authorization are enforced in migrated paths.
- Cloud SQL is the active DB for migrated app paths.
- Frontend runtime paths are routed through `nexum-api` (not Supabase runtime calls).
- Project onboarding/create/read/delete/chat/dashboard flows are running in GCP stack.

## Explicitly deferred to separate bucket

Supply-agent runtime activation and quality hardening are tracked separately as the agentic workstream:

- Deploy and validate real MCP endpoint for `SUPPLY_AGENT_MCP_URL` (remove placeholder URL).
- Set `SUPPLY_AGENT_MCP_REQUIRED=true` in production-like environments to fail fast on MCP outages.
- Ensure persisted `supply_agent_runs` + `agent_overrun_snapshot` updates for each run.
- Add agent observability pack (structured logs, run tracing, counters, alerts).
- Add E2E tests for create project -> run agent -> non-zero/expected counters and dashboard impact.

## Why this split

This keeps migration delivery closed while isolating the most volatile part (agent orchestration + external data + MCP runtime) into a dedicated bucket with its own milestones and risk controls.

## Immediate next actions (new bucket kickoff)

1. Provision/deploy MCP Cloud Run service and verify health endpoint.
2. Update `nexum-api` env:
   - `SUPPLY_AGENT_MCP_URL=<real_mcp_url>`
   - `SUPPLY_AGENT_MCP_REQUIRED=true`
3. Run smoke on a known project and confirm:
   - non-null `last_run_status`,
   - non-empty run metadata counters,
   - expected UI metrics on `/agente`.
4. Implement explicit UI status when fallback/skeleton path is used (to avoid ambiguous "Sin corrida").
