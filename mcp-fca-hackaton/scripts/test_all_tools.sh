#!/usr/bin/env bash
# Test all MCP tools via HTTP (requires port-forward on 8000).
#
#   kubectl port-forward svc/mi-servidor-mcp 8000:8000
#   ./scripts/test_all_tools.sh
#
# Env:
#   OUTPUT_MODE=detailed  Multi-line summaries + final table (default)
#   OUTPUT_MODE=summary   One-line summaries + final table
#   OUTPUT_MODE=json      Full pretty-printed JSON per tool
#   OUTPUT_MAX_CHARS=8000 Truncation when OUTPUT_MODE=json (0 = unlimited)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSE_SCRIPT="$SCRIPT_DIR/parse_mcp_tool_response.py"
TABLE_SCRIPT="$SCRIPT_DIR/print_tool_results_table.py"

BASE="http://127.0.0.1:8000/mcp"
HDR=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
OUTPUT_MODE="${OUTPUT_MODE:-detailed}"
OUTPUT_MAX_CHARS="${OUTPUT_MAX_CHARS:-8000}"
RESULTS_FILE="$(mktemp)"

USER_ID="596c7e07-b277-494a-9c66-0dc453719dc8"
PROJECT_ID="cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"
SUPPLY_ID_CONCRETE="7280ce57-433d-4091-b548-ff8fbd00d7b1"
ACTIVITY_ID="771e760c-e837-4b03-a3ef-d0ef1188622a"
BUDGET_SNAPSHOT_ID="86afed66-aa8d-4dae-849a-dc46210a6660"
DAILY_REPORT_ID="98f4d8d2-71ab-4718-a2e7-51eac7cf7767"
REPORT_FECHA="2026-05-15"
INCIDENT_ID="bf81d700-2bd9-4d3f-90d5-e56d270722db"
PURCHASE_ORDER_ID="5edf2398-d285-482c-afff-058f129b54f8"
PAYROLL_PERIOD_ID="ec5a84bd-6a23-4367-85e2-015d659243e4"

PASS=0
FAIL=0

parse_and_print_response() {
  TOOL_NAME="$1" MAX_CHARS="${2:-8000}" OUTPUT_MODE="$OUTPUT_MODE" RESULTS_FILE="$RESULTS_FILE" \
    python3 "$PARSE_SCRIPT"
}

call_tool() {
  local id="$1"
  local desc="$2"
  local name="$3"
  local args="$4"
  local timeout="${5:-30}"

  echo "▶ $name"
  echo "  $desc"
  if curl -s --max-time "$timeout" -X POST "$BASE" "${HDR[@]}" \
    -H "mcp-session-id: $SESSION" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"tools/call\",\"params\":{\"name\":\"$name\",\"arguments\":$args}}" \
    | parse_and_print_response "$name" "$OUTPUT_MAX_CHARS"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

print_results_table() {
  RESULTS_FILE="$RESULTS_FILE" python3 "$TABLE_SCRIPT"
}

echo "=== Initializing MCP session ==="
SESSION=$(curl -si -X POST "$BASE" "${HDR[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-all","version":"1.0.0"}}}' \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="mcp-session-id" {print $2}' | tail -1)

if [ -z "$SESSION" ]; then
  echo "ERROR: No mcp-session-id. Is port-forward running?"
  echo "  kubectl port-forward svc/mi-servidor-mcp 8000:8000"
  rm -f "$RESULTS_FILE"
  exit 1
fi
echo "Session: $SESSION"
echo "OUTPUT_MODE: $OUTPUT_MODE"
echo ""

echo "=== Project read tools (18) ==="

call_tool 2 \
  "List construction projects the user can access via project_memberships." \
  list_user_projects \
  "{\"user_id\":\"$USER_ID\"}"

call_tool 3 \
  "Project dashboard: progress, open incidents, latest daily report and budget snapshot." \
  get_project_summary \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 4 \
  "Phases and nested activities with planned/executed quantities and progress %." \
  list_project_phases_and_activities \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 5 \
  "Single activity detail with linked supplies from the supply catalog." \
  get_activity_detail \
  "{\"user_id\":\"$USER_ID\",\"activity_id\":\"$ACTIVITY_ID\"}"

call_tool 6 \
  "Latest approved budget snapshot with line items and supply breakdown." \
  get_project_budget_status \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 7 \
  "Specific budget snapshot by id (tests budget_snapshot_id filter)." \
  get_project_budget_status \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"budget_snapshot_id\":\"$BUDGET_SNAPSHOT_ID\"}"

call_tool 8 \
  "List daily field reports for the project (fecha, crew size, etc.)." \
  list_daily_reports \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"limit\":10}"

call_tool 9 \
  "Daily report detail looked up by daily_report_id, with per-activity items." \
  get_daily_report_detail \
  "{\"user_id\":\"$USER_ID\",\"daily_report_id\":\"$DAILY_REPORT_ID\"}"

call_tool 10 \
  "Same tool looked up by project_id + fecha instead of report id." \
  get_daily_report_detail \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"fecha\":\"$REPORT_FECHA\"}"

call_tool 11 \
  "Open safety/quality incidents for the project (solo_abiertos=true)." \
  list_project_incidents \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"solo_abiertos\":true}"

call_tool 12 \
  "Incident detail with description, severity, status, and corrective actions." \
  get_incident_detail \
  "{\"user_id\":\"$USER_ID\",\"incident_id\":\"$INCIDENT_ID\"}"

call_tool 13 \
  "Search supply catalog by name; includes open availability alerts." \
  get_supply_catalog_search \
  "{\"user_id\":\"$USER_ID\",\"query\":\"cemento\",\"limit\":5}"

call_tool 14 \
  "Schedule baseline with planned vs actual dates and overdue count." \
  get_schedule_status \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 15 \
  "Activities past planned end date without an actual finish date." \
  list_overdue_schedule_items \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 16 \
  "Purchase orders for the project with supplier references." \
  list_purchase_orders \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 17 \
  "Purchase order with line items, supplier info, and payments." \
  get_purchase_order_detail \
  "{\"user_id\":\"$USER_ID\",\"purchase_order_id\":\"$PURCHASE_ORDER_ID\"}"

call_tool 18 \
  "Search active suppliers by name substring." \
  search_suppliers \
  "{\"user_id\":\"$USER_ID\",\"query\":\"a\",\"limit\":5}"

call_tool 19 \
  "Payroll periods registered for the project." \
  list_payroll_periods \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

call_tool 20 \
  "Payroll period with employee entries and total net pay." \
  get_payroll_period_detail \
  "{\"user_id\":\"$USER_ID\",\"payroll_period_id\":\"$PAYROLL_PERIOD_ID\"}"

call_tool 21 \
  "Project team roster with roles and profile info." \
  list_project_team \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

echo "=== Material price forecast ==="

call_tool 25 \
  "Scrape FRED PPI indices, forecast material prices, compute budget impact, and persist run/forecasts/alerts." \
  material_price_forecast \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"horizon_months\":6}" \
  90

echo "=== Material price forecast chart ==="

call_tool 31 \
  "Generate SVG charts: budget plan (flat unit price) vs forecast trajectory per supply, plus project budget bars." \
  material_price_forecast_chart \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\"}"

echo "=== Supply price agent read tools (6) ==="

call_tool 26 \
  "List persisted material-price agent runs for the project (newest first)." \
  list_supply_agent_runs \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"limit\":5}"

call_tool 27 \
  "List budget overrun alerts when projected mapped supply cost exceeds threshold." \
  list_supply_cost_overrun_alerts \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"limit\":10}"

call_tool 28 \
  "List stored per-supply cost forecast points from past agent runs." \
  list_supply_cost_forecasts \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"limit\":20}"

call_tool 29 \
  "Configured external price sources (FRED series) for a catalog supply." \
  list_supply_price_sources \
  "{\"user_id\":\"$USER_ID\",\"supply_id\":\"$SUPPLY_ID_CONCRETE\"}"

call_tool 30 \
  "Historical scraped/index price observations for a supply in this project." \
  list_supply_price_observations \
  "{\"user_id\":\"$USER_ID\",\"supply_id\":\"$SUPPLY_ID_CONCRETE\",\"project_id\":\"$PROJECT_ID\",\"limit\":10}"

echo "=== Agent orchestrator (slow — up to 300s) ==="
echo "▶ langgraph_agent_orchestrator"
echo "  Natural-language agent that plans and calls project tools to answer a query (Ollama or rules backend)."
if curl -s --max-time 300 -N -X POST "$BASE" "${HDR[@]}" \
  -H "mcp-session-id: $SESSION" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":24,\"method\":\"tools/call\",\"params\":{\"name\":\"langgraph_agent_orchestrator\",\"arguments\":{\"query\":\"Resumen del proyecto Edificio Nexum Central para user $USER_ID\"}}}" \
  | parse_and_print_response "langgraph_agent_orchestrator" "$OUTPUT_MAX_CHARS"; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
fi

if [ "$OUTPUT_MODE" = "summary" ] || [ "$OUTPUT_MODE" = "detailed" ]; then
  print_results_table
fi

echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

rm -f "$RESULTS_FILE"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
