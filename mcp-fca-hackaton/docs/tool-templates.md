# MCP Tool Call Templates

Reference for calling every tool exposed by the FastMCP server. All tools use the same HTTP transport.

**Endpoint:** `POST http://127.0.0.1:8000/mcp` (or `http://mi-servidor-mcp:8000/mcp` in-cluster)

**Headers (every call after session init):**

```http
Content-Type: application/json
Accept: application/json, text/event-stream
mcp-session-id: <from initialize response header>
```

---

## Session setup

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "my-client", "version": "1.0.0" }
  }
}
```

**Tool call envelope:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": { }
  }
}
```

**Response:** SSE stream — parse the `data:` line. Payload is in `result.structuredContent` or `result.content[0].text` (JSON string).

**Common response wrapper (Supabase tools):**

```json
{ "success": true, ... }
{ "success": false, "error": "message", "code": "forbidden" }
```

---

## Test fixture IDs

Use these with the seeded Nexum Central project (`test_all_tools.sh`):

| Variable | UUID / value |
|---|---|
| `USER_ID` | `596c7e07-b277-494a-9c66-0dc453719dc8` |
| `PROJECT_ID` | `cd8d71f7-5de1-4f49-a2c3-5ebf56773c67` |
| `SUPPLY_ID_CONCRETE` | `7280ce57-433d-4091-b548-ff8fbd00d7b1` |
| `ACTIVITY_ID` | `771e760c-e837-4b03-a3ef-d0ef1188622a` |
| `BUDGET_SNAPSHOT_ID` | `86afed66-aa8d-4dae-849a-dc46210a6660` |
| `DAILY_REPORT_ID` | `98f4d8d2-71ab-4718-a2e7-51eac7cf7767` |
| `REPORT_FECHA` | `2026-05-15` |
| `INCIDENT_ID` | `bf81d700-2bd9-4d3f-90d5-e56d270722db` |
| `PURCHASE_ORDER_ID` | `5edf2398-d285-482c-afff-058f129b54f8` |
| `PAYROLL_PERIOD_ID` | `ec5a84bd-6a23-4367-85e2-015d659243e4` |

Optional on any Supabase tool: `"access_token": "<supabase_user_jwt>"`.

---

## Project & dashboard

### `list_user_projects`

List projects the user belongs to.

| Parameter | Required | Type | Description |
|---|---|---|---|
| `user_id` | yes | UUID | Profile id |
| `access_token` | no | string | Supabase JWT |

```json
{
  "name": "list_user_projects",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8"
  }
}
```

**Output:** `{ success, user_id, count, projects[] }` — each project has `id`, `nombre`, `estado`, etc. Includes a `hint` with example `project_id`.

---

### `get_project_summary`

Project dashboard: progress, incidents, latest report and budget snapshot.

| Parameter | Required | Type | Description |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID or name | e.g. `"Edificio Nexum Central"` |
| `access_token` | no | string | |

```json
{
  "name": "get_project_summary",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project, metrics }` where `metrics` contains:

- `phase_count`, `activity_count`
- `average_progress_percentage`
- `open_incidents`
- `latest_daily_report` — `{ id, fecha, personal_presente }`
- `latest_budget_snapshot` — `{ id, version_number, estado, total_budget, snapshot_date }`

---

### `list_project_phases_and_activities`

Phases with nested activities and progress.

| Parameter | Required | Type | Default | Description |
|---|---|---|---|---|
| `user_id` | yes | UUID | | |
| `project_id` | yes | UUID/name | | |
| `phase_id` | no | UUID | null | Filter to one phase |
| `search` | no | string | null | Filter activities/phases by name |
| `access_token` | no | string | | |

```json
{
  "name": "list_project_phases_and_activities",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project_id, phase_count, phases[] }` — each phase has `nombre`, `activities[]` with `nombre`, `cantidad_planeada`, `cantidad_ejecutada`, `progress_percentage`.

---

### `get_activity_detail`

Single activity with linked supplies.

| Parameter | Required | Type |
|---|---|---|
| `user_id` | yes | UUID |
| `activity_id` | yes | UUID |
| `access_token` | no | string |

```json
{
  "name": "get_activity_detail",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "activity_id": "771e760c-e837-4b03-a3ef-d0ef1188622a"
  }
}
```

**Output:** `{ success, activity, supplies[], supply_count }` — activity includes phase/project nesting; each supply has `supply_catalog { nombre, unidad_medida, tipo, ... }`, quantities and prices.

---

### `list_project_team`

Team roster with roles and profile info.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `solo_activos` | no | bool | `true` |
| `access_token` | no | string | |

```json
{
  "name": "list_project_team",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project_id, count, team[] }` — each member has `role`, `active`, `profiles { full_name, email, job_title }`.

---

## Budget

### `get_project_budget_status`

Latest or specific budget snapshot with line items.

| Parameter | Required | Type | Description |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `budget_snapshot_id` | no | UUID | Omit for latest |
| `access_token` | no | string | |

```json
{
  "name": "get_project_budget_status",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

With specific snapshot:

```json
{
  "name": "get_project_budget_status",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "budget_snapshot_id": "86afed66-aa8d-4dae-849a-dc46210a6660"
  }
}
```

**Output:** `{ success, project_id, snapshot, item_count, items[] }` — items include `cantidad_planeada`, `precio_unitario`, `subtotal`, nested `activity_supplies.supply_catalog`.

---

## Daily reports

### `list_daily_reports`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `fecha_desde` | no | date | null |
| `fecha_hasta` | no | date | null |
| `limit` | no | int | `20` |
| `access_token` | no | string | |

```json
{
  "name": "list_daily_reports",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "limit": 10
  }
}
```

**Output:** `{ success, project_id, count, reports[] }` — each report has `id`, `fecha`, `personal_presente`, etc.

---

### `get_daily_report_detail`

Lookup by report id **or** by project + date.

| Parameter | Required | Type | Notes |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `daily_report_id` | no* | UUID | *Provide this **or** project_id+fecha |
| `project_id` | no* | UUID/name | |
| `fecha` | no* | date | `YYYY-MM-DD` |
| `access_token` | no | string | |

By id:

```json
{
  "name": "get_daily_report_detail",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "daily_report_id": "98f4d8d2-71ab-4718-a2e7-51eac7cf7767"
  }
}
```

By date:

```json
{
  "name": "get_daily_report_detail",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "fecha": "2026-05-15"
  }
}
```

**Output:** `{ success, report, items[], item_count }` — items link to `activities` with executed quantities.

---

## Incidents

### `list_project_incidents`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `estado` | no | string | null |
| `severidad` | no | string | null |
| `solo_abiertos` | no | bool | `false` |
| `access_token` | no | string | |

```json
{
  "name": "list_project_incidents",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "solo_abiertos": true
  }
}
```

**Output:** `{ success, project_id, count, incidents[] }` — each has `tipo`, `severidad`, `estado`, `descripcion`.

---

### `get_incident_detail`

| Parameter | Required | Type |
|---|---|---|
| `user_id` | yes | UUID |
| `incident_id` | yes | UUID |
| `access_token` | no | string |

```json
{
  "name": "get_incident_detail",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "incident_id": "bf81d700-2bd9-4d3f-90d5-e56d270722db"
  }
}
```

**Output:** `{ success, incident, actions[], action_count }` — incident fields plus corrective `actions`.

---

## Schedule

### `get_schedule_status`

Baseline schedule with planned vs actual dates.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `schedule_baseline_id` | no | UUID | latest baseline |
| `access_token` | no | string | |

```json
{
  "name": "get_schedule_status",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project_id, baseline, item_count, overdue_count, items[] }` — items include activity name, planned/real dates, `progress_percentage`, `estado`.

---

### `list_overdue_schedule_items`

Activities past planned end without actual finish.

| Parameter | Required | Type |
|---|---|---|
| `user_id` | yes | UUID |
| `project_id` | yes | UUID/name |
| `schedule_baseline_id` | no | UUID |
| `access_token` | no | string |

```json
{
  "name": "list_overdue_schedule_items",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project_id, baseline_id, count, items[] }`.

---

## Procurement

### `get_supply_catalog_search`

Search supply catalog; includes open availability alerts.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `query` | yes | string | substring match |
| `tipo` | no | string | null |
| `solo_criticos` | no | bool | `false` |
| `limit` | no | int | `25` |
| `access_token` | no | string | |

```json
{
  "name": "get_supply_catalog_search",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "query": "concreto",
    "limit": 5
  }
}
```

**Output:** `{ success, query, count, supplies[], open_alerts[] }`.

---

### `list_purchase_orders`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `estado` | no | string | null |
| `access_token` | no | string | |

```json
{
  "name": "list_purchase_orders",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project_id, count, purchase_orders[] }` with supplier info.

---

### `get_purchase_order_detail`

| Parameter | Required | Type |
|---|---|---|
| `user_id` | yes | UUID |
| `purchase_order_id` | yes | UUID |
| `access_token` | no | string |

```json
{
  "name": "get_purchase_order_detail",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "purchase_order_id": "5edf2398-d285-482c-afff-058f129b54f8"
  }
}
```

**Output:** `{ success, purchase_order, supplier, items[], payments[], item_count, payment_count }`.

---

### `search_suppliers`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `query` | yes | string | |
| `solo_activos` | no | bool | `true` |
| `limit` | no | int | `25` |
| `access_token` | no | string | |

```json
{
  "name": "search_suppliers",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "query": "andinos",
    "limit": 5
  }
}
```

**Output:** `{ success, query, count, suppliers[] }`.

---

## Payroll

### `list_payroll_periods`

| Parameter | Required | Type |
|---|---|---|
| `user_id` | yes | UUID |
| `project_id` | yes | UUID/name |
| `access_token` | no | string |

```json
{
  "name": "list_payroll_periods",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
  }
}
```

**Output:** `{ success, project_id, count, payroll_periods[] }`.

---

### `get_payroll_period_detail`

| Parameter | Required | Type |
|---|---|---|
| `user_id` | yes | UUID |
| `payroll_period_id` | yes | UUID |
| `access_token` | no | string |

```json
{
  "name": "get_payroll_period_detail",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "payroll_period_id": "ec5a84bd-6a23-4367-85e2-015d659243e4"
  }
}
```

**Output:** `{ success, payroll_period, entries[], entry_count, total_neto }`.

---

## Material price forecast (write)

### `material_price_forecast`

Scrape FRED PPI indices, forecast trends, compute budget impact, persist run data.

| Parameter | Required | Type | Default | Description |
|---|---|---|---|---|
| `user_id` | yes | UUID | | Triggering user |
| `project_id` | yes | UUID/name | | |
| `horizon_months` | no | int | `6` | 1–24 |
| `material_queries` | no | string[] | null | Filter budget supplies by name |
| `history_months` | no | int | `36` | 12–120 |
| `access_token` | no | string | | Supabase JWT |
| `persist` | no | bool | `true` | Write to DB |
| `overrun_threshold_pct` | no | float | `10.0` | Alert threshold |
| `trigger` | no | string | `"mcp"` | `"manual"` \| `"cron"` \| `"mcp"` |
| `dry_run` | no | bool | `false` | Skip DB writes |

```json
{
  "name": "material_price_forecast",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "horizon_months": 6,
    "trigger": "manual",
    "overrun_threshold_pct": 10.0
  }
}
```

Filtered run:

```json
{
  "name": "material_price_forecast",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "material_queries": ["concreto", "acero"],
    "horizon_months": 6,
    "dry_run": true
  }
}
```

**Output (key fields):**

| Field | Description |
|---|---|
| `run_id` | UUID of persisted run (null if dry_run / no persist) |
| `project_id` | Resolved UUID |
| `material_count` | Mapped supplies count |
| `materials[]` | Per-supply budget + forecast % and delta |
| `supplies[]` | Per-supply `observations[]`, `points[]`, `status`, `errors` |
| `unmapped_supplies[]` | Budget lines with no price source |
| `supply_errors[]` | Global error list (`stage`, `code`, `message`) |
| `series_forecasts[]` | Raw FRED series + forecast arrays |
| `budget_impact` | `{ total_budget_subtotal, projected_subtotal, estimated_indexed_delta_pct, overrun_triggered }` |
| `alerts[]` | Overrun alerts created this run |
| `run` | `{ id, status, counters, budget_summary, duration_ms }` |
| `persistence` | `{ enabled, dry_run, warning }` |
| `disclaimer` | Notes that values are US PPI index proxies |

**Timeout recommendation:** 90 s.

---

## Supply price agent (read)

### `list_supply_agent_runs`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `status` | no | string | null — e.g. `"completed"` |
| `limit` | no | int | `20` |
| `access_token` | no | string | |

```json
{
  "name": "list_supply_agent_runs",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "limit": 5
  }
}
```

**Output:** `{ success, project_id, count, runs[] }` — each run has `id`, `status`, `started_at`, `finished_at`, `metadata { trigger, horizon_months, counters, budget_summary }`.

---

### `get_supply_agent_run`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `run_id` | yes | UUID | From forecast response |
| `include_forecasts` | no | bool | `false` |
| `include_alerts` | no | bool | `true` |
| `access_token` | no | string | |

```json
{
  "name": "get_supply_agent_run",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "run_id": "<run_id from material_price_forecast>",
    "include_forecasts": true,
    "include_alerts": true
  }
}
```

**Output:** `{ success, run, project_id, alerts[], alert_count, forecasts[], forecast_count }`.

---

### `list_supply_cost_overrun_alerts`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | yes | UUID/name | |
| `status` | no | string | null — e.g. `"open"` |
| `limit` | no | int | `25` |
| `access_token` | no | string | |

```json
{
  "name": "list_supply_cost_overrun_alerts",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "limit": 10
  }
}
```

**Output:** `{ success, project_id, count, alerts[] }` — each alert has `severity`, `status`, `baseline_budget`, `projected_total_cost`, `overrun_amount`, `overrun_pct`, `threshold_pct`, `metadata.decision`, `metadata.top_drivers`.

---

### `list_supply_cost_forecasts`

At least one filter required: `project_id`, `run_id`, or `supply_id`.

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `project_id` | no* | UUID/name | |
| `run_id` | no* | UUID | |
| `supply_id` | no* | UUID | |
| `limit` | no | int | `100` |
| `access_token` | no | string | |

```json
{
  "name": "list_supply_cost_forecasts",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "limit": 20
  }
}
```

**Output:** `{ success, project_id, run_id, supply_id, count, forecasts[] }` — each row has `forecast_date`, `predicted_unit_price`, `model_version`, `metadata { unit_price_index, sequence, forecast_pct_change }`.

---

### `list_supply_price_observations`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `supply_id` | yes | UUID | Catalog supply id |
| `project_id` | yes | UUID/name | |
| `fecha_desde` | no | date | null |
| `fecha_hasta` | no | date | null |
| `limit` | no | int | `100` |
| `access_token` | no | string | |

```json
{
  "name": "list_supply_price_observations",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "supply_id": "7280ce57-433d-4091-b548-ff8fbd00d7b1",
    "project_id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
    "limit": 10
  }
}
```

**Output:** `{ success, project_id, supply_id, count, observations[] }` — each has `observed_at`, `unit_price`, `currency`, `raw_payload`, nested `supply_price_sources`.

---

### `list_supply_price_sources`

| Parameter | Required | Type | Default |
|---|---|---|---|
| `user_id` | yes | UUID | |
| `supply_id` | yes | UUID | |
| `solo_activos` | no | bool | `true` |
| `access_token` | no | string | |

```json
{
  "name": "list_supply_price_sources",
  "arguments": {
    "user_id": "596c7e07-b277-494a-9c66-0dc453719dc8",
    "supply_id": "7280ce57-433d-4091-b548-ff8fbd00d7b1"
  }
}
```

**Output:** `{ success, supply_id, count, sources[] }` — each source has `source_name`, `source_url`, `parse_config { series_id, keywords, label }`, `is_active`, `last_success_at`.

---

## Agent

### `langgraph_agent_orchestrator`

Natural-language orchestrator over project tools (Ollama or rules backend).

| Parameter | Required | Type |
|---|---|---|
| `query` | yes | string |

```json
{
  "name": "langgraph_agent_orchestrator",
  "arguments": {
    "query": "Resumen del proyecto Edificio Nexum Central para user 596c7e07-b277-494a-9c66-0dc453719dc8"
  }
}
```

**Output:** `{ success, backend, tools_used[], final_result, query }` — `tools_used` lists MCP tools invoked; `final_result` is the synthesized answer.

**Timeout recommendation:** 300 s (SSE keepalive pings during wait).

---

## Demo / public API tools

### `get_pypi_package_info`

| Parameter | Required | Type |
|---|---|---|
| `package_name` | yes | string |

```json
{
  "name": "get_pypi_package_info",
  "arguments": { "package_name": "fastmcp" }
}
```

**Output:** `{ package, summary, latest_version, author, home_page, license }` or `{ error }`.

---

### `search_public_chemical_database`

| Parameter | Required | Type |
|---|---|---|
| `compound_name` | yes | string |

```json
{
  "name": "search_public_chemical_database",
  "arguments": { "compound_name": "water" }
}
```

**Output:** `{ compound, database_id, formula, molecular_weight, iupac_name, connection_status }` or `{ error }`.

---

## curl one-liner template

Replace `SESSION`, `TOOL`, and `ARGS`:

```bash
curl -s --max-time 90 -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: SESSION" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"TOOL","arguments":ARGS}}'
```

---

## Tool index (28 tools)

| # | Tool | Category |
|---|---|---|
| 1 | `list_user_projects` | Project |
| 2 | `get_project_summary` | Project |
| 3 | `list_project_phases_and_activities` | Project |
| 4 | `get_activity_detail` | Project |
| 5 | `list_project_team` | Project |
| 6 | `get_project_budget_status` | Budget |
| 7 | `list_daily_reports` | Reports |
| 8 | `get_daily_report_detail` | Reports |
| 9 | `list_project_incidents` | Incidents |
| 10 | `get_incident_detail` | Incidents |
| 11 | `get_schedule_status` | Schedule |
| 12 | `list_overdue_schedule_items` | Schedule |
| 13 | `get_supply_catalog_search` | Procurement |
| 14 | `list_purchase_orders` | Procurement |
| 15 | `get_purchase_order_detail` | Procurement |
| 16 | `search_suppliers` | Procurement |
| 17 | `list_payroll_periods` | Payroll |
| 18 | `get_payroll_period_detail` | Payroll |
| 19 | `material_price_forecast` | Price agent (write) |
| 20 | `list_supply_agent_runs` | Price agent (read) |
| 21 | `get_supply_agent_run` | Price agent (read) |
| 22 | `list_supply_cost_overrun_alerts` | Price agent (read) |
| 23 | `list_supply_cost_forecasts` | Price agent (read) |
| 24 | `list_supply_price_observations` | Price agent (read) |
| 25 | `list_supply_price_sources` | Price agent (read) |
| 26 | `langgraph_agent_orchestrator` | Agent |
| 27 | `get_pypi_package_info` | Demo |
| 28 | `search_public_chemical_database` | Demo |

See also: [integration.md](./integration.md) for auth, sync behavior, and field-level contracts.
