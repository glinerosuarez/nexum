# Block 1 Migration Contracts (GCP)

## Locked architecture

- Frontend runtime: Next.js on Cloud Run (`nexum-web`)
- Backend API: Cloud Run (`nexum-api`)
- Auth: Firebase ID tokens (`Authorization: Bearer <token>`)
- DB: Cloud SQL PostgreSQL (private)
- MCP agent: Cloud Run service consumed by backend API

## Replaced runtime paths

- Old: `supabase.functions.invoke("run_supply_cost_agent", ...)`
- New: `POST /agent/run-supply-cost`

- Old: Next.js server components queried Supabase directly
- New: Next.js server components call `nexum-api` endpoints via `NEXUM_API_BASE_URL`

- Old: Project chat read/write via Supabase in Next route handlers
- New: Next route handlers proxy to `GET/POST /chat/messages`

- Old: Onboarding server action wrote directly to Supabase
- New: `createProjectAction` calls `POST /projects` (API-side project + phases + bootstrap transaction)

## Migrated API surface

- `POST /projects`
- `DELETE /projects/:id`
- `GET /projects`
- `GET /projects/:id/basic`
- `GET /projects/:id/exists`
- `POST /agent/run-supply-cost`
- `GET /chat/messages`
- `POST /chat/messages`
- `GET /dashboard/summary`

## Required envs (web)

- `NEXUM_API_BASE_URL`
- Optional: `firebase_id_token` cookie for server-rendered calls

## Required envs (api)

- DB: `CLOUD_SQL_INSTANCE`, `DB_NAME`, `DB_USER`, `DB_PASS`
- Auth: `FIREBASE_PROJECT_ID`, optional `FIREBASE_AUTH_REQUIRED` (default `true`)
- MCP: `SUPPLY_AGENT_MCP_URL`, `SUPPLY_AGENT_MCP_REQUIRED`, `SUPPLY_AGENT_MCP_TIMEOUT_MS`, optional `SUPPLY_AGENT_MCP_BEARER`

## Correlation invariant

Every request emits/propagates `x-run-id`, and `POST /agent/run-supply-cost` always returns `run_id`.

## Scope boundary (as of 2026-05-31)

- Block 1 is closed as a platform migration block (Cloud Run + Cloud SQL + Firebase + API indirection).
- Supply-agent runtime activation is tracked in a separate workstream and is not a Block 1 closure blocker.
- Current API fallback behavior (`SUPPLY_AGENT_MCP_REQUIRED=false`) can return a successful skeleton response with zero counters when MCP is unavailable.
