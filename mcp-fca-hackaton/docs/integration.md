# Supply Price Agent — Integration Spec

This service exposes **MCP tools over HTTP JSON-RPC**, not a REST resource API. All calls go to one endpoint; tools are invoked by name.

---

## 1. Endpoint URLs

### Base URL (deployed)

| Environment | URL |
|---|---|
| Minikube (port-forward) | `http://127.0.0.1:8000/mcp` |
| In-cluster | `http://mi-servidor-mcp:8000/mcp` |
| Cloud Run (public demo) | `https://<cloud-run-service-url>/mcp` |

Service: `k8s/service.yaml` — ClusterIP port **8000**, path **`/mcp`**.

### Protocol flow

```
POST /mcp  →  initialize          (get mcp-session-id header)
POST /mcp  →  tools/call          (invoke tool)
POST /mcp  →  tools/list          (optional discovery)
```

### Manual run (trigger forecast)

**Tool:** `material_price_forecast`

```http
POST /mcp
Content-Type: application/json
Accept: application/json, text/event-stream
mcp-session-id: <from initialize>
```

```json
{
  "jsonrpc": "2.0",
  "id": 25,
  "method": "tools/call",
  "params": {
    "name": "material_price_forecast",
    "arguments": {
      "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
      "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
      "horizon_months": 6,
      "trigger": "manual"
    }
  }
}
```

There is **no separate async job URL**. The run completes in this single call and returns `run_id` plus the full result inline.

### Status / result (post-run or historical)

| Purpose | Tool | Key inputs |
|---|---|---|
| Run status + metadata | `get_supply_agent_run` | `user_id`, `run_id`, `include_forecasts`, `include_alerts` |
| List runs for project | `list_supply_agent_runs` | `user_id`, `project_id`, optional `status` |
| Stored forecast rows | `list_supply_cost_forecasts` | `user_id`, plus one of `project_id` / `run_id` / `supply_id` |
| Stored scraped prices | `list_supply_price_observations` | `user_id`, `supply_id`, `project_id` |
| Overrun alerts | `list_supply_cost_overrun_alerts` | `user_id`, `project_id`, optional `status` |
| Price source config | `list_supply_price_sources` | `user_id`, `supply_id` |

Example — fetch run with alerts and forecasts:

```json
{
  "jsonrpc": "2.0",
  "id": 26,
  "method": "tools/call",
  "params": {
    "name": "get_supply_agent_run",
    "arguments": {
      "user_id": "<uuid>",
      "run_id": "<uuid from material_price_forecast>",
      "include_forecasts": true,
      "include_alerts": true
    }
  }
}
```

### MCP response envelope

The response is **SSE** (`text/event-stream`). Parse the `data:` line:

```json
{
  "result": {
    "structuredContent": { "success": true }
  }
}
```

Fallback: `result.content[0].text` as a JSON string.

Top-level errors: `{ "error": { "message": "..." } }`.

Tool-level errors: `{ "success": false, "error": "..." }` inside the payload.

---

## 2. Auth

### MCP transport (required)

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Accept` | `application/json, text/event-stream` |
| `mcp-session-id` | Returned by `initialize` response header |

**No API key or JWT on the MCP HTTP layer today.** The session ID from `initialize` is the only transport auth.
When deployed to Cloud Run for demo, this endpoint may be public (`--allow-unauthenticated`).

### Data access behavior

Pass **`access_token`** in tool `arguments` if you want to propagate end-user auth context from the caller.

| Mode | Server behavior |
|---|---|
| `access_token` omitted | Uses Cloud SQL runtime credentials and enforces `project_memberships` by `user_id` |
| `access_token` provided | Currently accepted for contract compatibility; membership checks still execute server-side |

**Integrator recommendation:** pass the same end-user auth context consistently, but do not rely on MCP-side RLS semantics; authorization is enforced in the tool layer.

---

## 2.1 LangGraph backend runtime

The `langgraph_agent_orchestrator` tool supports these runtime backends:

| Env var | Values | Default |
|---|---|---|
| `AGENT_BACKEND` | `vertex`, `ollama`, `rules` | `vertex` |

### Vertex (recommended in Google Cloud)

| Env var | Example |
|---|---|
| `VERTEX_PROJECT_ID` | `my-hackathon-project` |
| `VERTEX_LOCATION` | `us-central1` |
| `VERTEX_MODEL` | `gemini-1.5-pro` |

### Ollama (legacy/local)

| Env var | Example |
|---|---|
| `OLLAMA_BASE_URL` | `http://host.minikube.internal:11434` |
| `OLLAMA_MODEL` | `qwen2.5:7b` |

---

## 3. Request payload contract

### `material_price_forecast` (primary write/run tool)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `user_id` | UUID string | yes | — | Profile with project access |
| `project_id` | UUID or project `nombre` | yes | — | Resolved to UUID in response |
| `horizon_months` | int | no | `6` | 1–24 |
| `material_queries` | string[] | no | `null` | Substring filters on supply names, e.g. `["cemento","acero"]` |
| `history_months` | int | no | `36` | 12–120; FRED history window |
| `access_token` | string | no | `null` | Supabase user JWT |
| `persist` | bool | no | `true` | Write to Supabase tables |
| `overrun_threshold_pct` | float | no | `10.0` | Alert if mapped budget delta % exceeds this |
| `trigger` | string | no | `"mcp"` | `"manual"` \| `"cron"` \| `"mcp"` — stored in run metadata |
| `dry_run` | bool | no | `false` | Compute only; no DB writes |

**Supply resolution (automatic):**

1. Loads project budget and aggregates line items by `supply_id`.
2. Maps each supply via `supply_price_sources` (active, by priority) or keyword fallback (cement/steel/lumber/diesel → FRED PPI).
3. Unmapped supplies appear in `unmapped_supplies` / `supply_errors` and are excluded from budget impact.

**No `supply_id` list input** — filtering is via `material_queries` on budget supply names.

---

## 4. Response contract

All successful tool payloads include `"success": true` at top level.

### 4a. Scraped prices (inline + persisted)

**Inline per supply** — `supplies[].observations[]`:

| Field | Type | Description |
|---|---|---|
| `observed_at` | date string | `YYYY-MM-DD` |
| `unit_price` | number | FRED PPI index value (not local currency) |
| `source_id` | UUID | `supply_price_sources.id` |
| `scrape_method` | string | `"fred_csv"` or `"fred_api"` |

**Also:** `supplies[].latest_observation` = `{ "date", "value" }`.

**Series-level** — `series_forecasts[]` (one per FRED source):

| Field | Type |
|---|---|
| `series_key` | string | e.g. `"cement"` |
| `series_id` | string | FRED id, e.g. `"WPU0573"` |
| `label` | string |
| `unit` | string | `"index"` |
| `source_id` | UUID |
| `success` | bool |
| `history_source` | string |
| `history_count` | int |
| `historical_tail` | `[{date, value}]` | last 6 points |
| `observations` | `[{date, value}]` | full fetched history |
| `scrape_method` | string |
| `last_observation` | `{date, value}` |

**Persisted** — `list_supply_price_observations` rows:

| Field | Type |
|---|---|
| `id` | UUID |
| `project_id` | UUID |
| `supply_id` | UUID |
| `source_id` | UUID |
| `observed_at` | date |
| `unit_price` | numeric |
| `currency` | string | default `"USD"` |
| `raw_payload` | object | `{scrape_method, fetched_at, date, value}` |
| `supply_price_sources` | object | nested source metadata |

### 4b. Forecast points

**Inline per supply** — `supplies[].points[]`:

| Field | Type | Description |
|---|---|---|
| `forecast_date` | date | `YYYY-MM-DD` |
| `predicted_unit_price` | number | Index value, or budget-scaled if persisted |
| `unit_price_index` | number | Raw index forecast |
| `unit_price_index_lower` | number | Linear trend − 1σ band |
| `unit_price_index_upper` | number | Linear trend + 1σ band |
| `sequence` | int | 1-based month step |
| `id` | UUID | Present when persisted |

**Series-level** — `series_forecasts[].forecast[]`:

| Field | Type |
|---|---|
| `date` | date |
| `value` | number |
| `lower` | number |
| `upper` | number |

Plus: `method` (`"linear_trend"`), `forecast_pct_change`, `trend.slope_per_month`, `trend.residual_std`.

**Material rollup** — `materials[]`:

| Field | Type |
|---|---|
| `supply_id` | UUID |
| `supply_name` | string |
| `cantidad_planeada` | number |
| `precio_unitario_budget` | number |
| `subtotal_budget` | number |
| `series_key` | string |
| `forecast_pct_change` | number | % index change over horizon |
| `estimated_budget_delta` | number | subtotal × pct |
| `market_series` | string |
| `last_market_index` | `{date, value}` |
| `forecast_end` | `[{date, value, lower, upper}]` | last forecast point |

**Persisted** — `list_supply_cost_forecasts` / `get_supply_agent_run` forecasts:

| Field | Type |
|---|---|
| `id` | UUID |
| `run_id` | UUID |
| `project_id` | UUID |
| `supply_id` | UUID |
| `forecast_date` | date |
| `predicted_unit_price` | numeric | Scaled from budget unit price when available |
| `model_version` | string | `"1.0"` |
| `metadata` | object | see below |

`metadata` fields:

```json
{
  "sequence": 1,
  "model": "linear_trend",
  "unit_price_index": 472.5,
  "unit_price_index_lower": 468.1,
  "unit_price_index_upper": 476.9,
  "baseline_date": "2026-04-01",
  "baseline_value": 468.23,
  "forecast_pct_change": -2.15
}
```

(`forecast_pct_change` only on the final horizon point.)

### 4c. Overrun decision / alert metadata

**Decision logic** (project-level, mapped supplies only):

```
overrun_triggered = (estimated_indexed_delta > 0)
                 AND (estimated_indexed_delta_pct > overrun_threshold_pct)
```

**Inline** — `budget_impact`:

| Field | Type |
|---|---|
| `total_budget_subtotal` | number |
| `projected_subtotal` | number |
| `estimated_indexed_delta` | number |
| `estimated_indexed_delta_pct` | number |
| `overrun_triggered` | bool |
| `note` | string |

**Inline alerts** — `alerts[]` (only when `overrun_triggered` and persisted):

| Field | Type |
|---|---|
| `id` | UUID |
| `run_id` | UUID |
| `project_id` | UUID |
| `severity` | string | always `"critical"` |
| `status` | string | `"open"` |
| `threshold_pct` | number |
| `baseline_budget` | number |
| `projected_total_cost` | number |
| `overrun_amount` | number |
| `overrun_pct` | number |
| `metadata` | object |

`metadata` shape:

```json
{
  "alert_type": "project_budget_overrun",
  "message": "Projected mapped supply cost exceeds budget by X% (threshold Y%).",
  "decision": {
    "overrun_triggered": true,
    "threshold_pct": 10.0,
    "projected_delta_pct": 12.34,
    "comparison_basis": "mapped_supplies_subtotal"
  },
  "top_drivers": [
    {
      "supply_id": "uuid",
      "supply_name": "Concreto 3000 PSI",
      "delta_amount": 12345.67,
      "forecast_pct_change": 5.2
    }
  ]
}
```

**Run record** — `run`:

| Field | Type |
|---|---|
| `id` | UUID |
| `status` | string | `"completed"` or `"failed"` |
| `counters` | object | see below |
| `budget_summary` | object | same as `budget_impact` |
| `duration_ms` | int |

`counters`:

```json
{
  "supplies_requested": 5,
  "supplies_processed": 2,
  "sources_attempted": 2,
  "sources_succeeded": 2,
  "observations_written": 72,
  "forecasts_written": 12,
  "alerts_created": 0,
  "errors": 3
}
```

Run status `"failed"` only when `errors > 0` **and** `supplies_processed == 0`.

### 4d. Per-supply errors

**Global list** — `supply_errors[]`:

| Field | Type | Description |
|---|---|---|
| `supply_id` | UUID \| null | |
| `supply_name` | string | |
| `stage` | string | `"mapping"` \| `"scraping"` \| `"forecasting"` |
| `code` | string | see codes below |
| `message` | string | Human-readable |
| `source_id` | UUID \| null | |
| `retriable` | bool | |

**Error codes:**

| Code | Stage | Meaning |
|---|---|---|
| `no_price_source` | mapping | No DB source and no keyword match |
| `source_fetch_failed` | scraping | FRED fetch failed (`retriable: true`) |
| `observation_persist_failed` | scraping | DB write failed |
| `forecast_persist_failed` | forecasting | DB write failed |

**Per supply** — `supplies[]`:

| Field | Type |
|---|---|
| `supply_id` | UUID |
| `supply_name` | string |
| `status` | `"ok"` \| `"error"` |
| `errors` | array | Same shape as above |
| `observations` | array | Empty on error |
| `points` | array | Empty on error |

**Unmapped** — `unmapped_supplies[]`: budget supply objects with no price source.

---

## 5. Sync vs async and timeouts

| Aspect | Behavior |
|---|---|
| **Execution model** | **Fully synchronous.** One `material_price_forecast` call scrapes, forecasts, persists, and returns the complete payload. |
| **Async polling** | Not required for completion. Optional read tools for history/audit. |
| **Run lifecycle** | DB row: `running` → `completed`/`failed` within the same HTTP request. |
| **Typical duration** | ~5–15 s for 2–5 mapped supplies (FRED fetch + DB writes). |
| **Recommended client timeout** | **90 s** for `material_price_forecast` |
| **Default tool timeout** | 30 s (other tools) |
| **Agent tool** | `langgraph_agent_orchestrator` — up to **300 s** (streaming SSE pings during wait) |

### Persistence flags

| `persist` | `dry_run` | Behavior |
|---|---|---|
| `true` | `false` | Full write to 4 tables; returns `run_id` |
| `true` | `true` | No writes (`dry_run` wins) |
| `false` | any | Ephemeral response only; `run_id` may be null |

If tables are missing: `persistence.enabled=false`, `persistence.warning` set, still returns computed inline data.

---

## Quick integration checklist

1. `POST /mcp` → `initialize` → save `mcp-session-id`.
2. `POST /mcp` → `tools/call` → `material_price_forecast` with `trigger: "manual"`, user JWT in `access_token`.
3. Read `run_id`, `budget_impact.overrun_triggered`, `supplies[]`, `supply_errors[]` from the same response.
4. Optionally poll `get_supply_agent_run` / `list_supply_cost_overrun_alerts` later by `run_id` / `project_id`.
5. Treat `unit_price` / index values as **US PPI proxies**, not local currency quotes.

---

## Related files

| File | Purpose |
|---|---|
| `server.py` | MCP tool registration |
| `material_price_forecast.py` | Forecast orchestration and response shape |
| `supply_price_store.py` | Supabase persistence |
| `postgres_supply_read.py` | Cloud SQL read tools for runs, forecasts, observations, alerts |
| `test_all_tools.sh` | End-to-end smoke test (`OUTPUT_MODE=summary`) |
| `supabase/migrations/001_supply_price_agent.sql` | DB schema |
