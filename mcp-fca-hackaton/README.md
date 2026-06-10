# MCP Production Server

FastMCP HTTP server for construction project data on Cloud SQL and supply price forecasting (FRED PPI proxy).

## Layout

```
server.py                 # MCP entrypoint
infra/                    # Postgres / shared infra helpers
domain/project/           # Project read tools
domain/supply_price/      # Forecast pipeline + read tools + charts
domain/agent/             # legacy generic agent path
mcp_tools/                  # MCP tool registration
demo/                     # Demo API tools (PyPI, compound interest)
scripts/                  # Ops, seeding, integration tests
tests/                    # Unit tests
docs/                     # Integration spec, tool call templates
k8s/                      # Kubernetes manifests
supabase/migrations/      # SQL migrations
```

## Local development

```bash
uv sync
uv run python server.py
```

Set database credentials via environment:

- `DB_NAME`, `DB_USER`, `DB_PASS`
- `CLOUD_SQL_INSTANCE` (Unix socket) or `DB_HOST`/`DB_PORT` (TCP)

## Nexum API (Cloud Run backend layer)

Block 1 adds a separate backend service (`nexum-api`) for frontend data/auth/API contracts.

Run locally:

```bash
uv sync
uv run python nexum_api_server.py
```

Required envs:

- `DB_NAME`, `DB_USER`, `DB_PASS`
- `CLOUD_SQL_INSTANCE` (Unix socket) or `DB_HOST`/`DB_PORT` (TCP)
- `FIREBASE_PROJECT_ID`
- `SUPPLY_AGENT_MCP_URL` (+ optional `SUPPLY_AGENT_MCP_BEARER`)

Supply workflow orchestration on Google ADK / Agent Platform:

- `SUPPLY_AGENT_ORCHESTRATOR=adk`
- `AGENT_BUILDER_PROJECT_ID=<gcp-project-id>` (defaults to Vertex/project deploy context when set)
- `AGENT_BUILDER_LOCATION=us-central1`
- `AGENT_BUILDER_MODEL=gemini-2.5-flash`

The judge-facing `agentic_shadow` workflow should run under Google ADK orchestration. The existing extraction, qualification, normalization, mapping, persistence, and Phoenix spans remain the same domain logic, but the orchestration layer for `/project-input-batches/{input_batch_id}/agentic-shadow-runs/run` is intended to use ADK rather than LangGraph.

Deploy script:

```bash
./scripts/deploy_nexum_api_cloud_run.sh
```

### Agent backend selection

The `langgraph_agent_orchestrator` supports three backends:

- `AGENT_BACKEND=vertex` (default for cloud)
- `AGENT_BACKEND=ollama`
- `AGENT_BACKEND=rules` (deterministic fallback)

Vertex backend environment:

```bash
export AGENT_BACKEND=vertex
export VERTEX_PROJECT_ID="<gcp-project-id>"
export VERTEX_LOCATION="us-central1"
export VERTEX_MODEL="gemini-1.5-pro"
```

## Tests

```bash
uv run python -m unittest discover -s tests -v
```

Optional real-DB integration tests for onboarding + dashboard parity:

```bash
NEXUM_TEST_DB_CONN="postgresql://<user>:<pass>@<host>:5432/<db>" \
uv run python -m unittest tests/test_nexum_api_postgres_integration.py -v
```

Integration test against a running server (requires port-forward):

```bash
kubectl port-forward svc/mi-servidor-mcp 8000:8000
./scripts/test_all_tools.sh
```

Or from repo root: `./test_all_tools.sh` (wrapper).

## Forecast workflow

```bash
./scripts/run_forecast_and_chart.sh
./scripts/analyze_forecast_consistency.py
```

Generated SVG charts are written to `forecast_charts/` (gitignored).

## Docker / Minikube

```bash
docker build -t mi-servidor-mcp:latest .
kubectl apply -f k8s/
kubectl rollout restart deployment/mi-servidor-mcp
```

The image sets `PYTHONPATH=/app` and copies `server.py`, `infra/`, `domain/`, `mcp_tools/`, and `demo/`.

## Cloud Run deployment (Agent Platform path)

Deploy the MCP server as a public Cloud Run endpoint:

```bash
export GCP_PROJECT_ID="<gcp-project-id>"
export GCP_REGION="us-central1"
export CLOUD_SQL_INSTANCE="<project:region:instance>"
export DB_NAME="<db-name>"
export DB_USER="<db-user>"
export DB_PASS="<db-password>"

./scripts/deploy_cloud_run.sh
```

The script builds and deploys the container, then prints the MCP endpoint:

`https://<service-url>/mcp`

Detailed runbook: `docs/agent-platform-cloud-run.md`.
