#!/usr/bin/env bash
# Initialize MCP session, run material_price_forecast, then material_price_forecast_chart.
#
#   kubectl port-forward svc/mi-servidor-mcp 8000:8000
#   ./scripts/run_forecast_and_chart.sh
#
# Env:
#   BASE, USER_ID, PROJECT_ID  override defaults below
#   OUT_DIR                    where to write SVG files (default: ./forecast_charts)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BASE="${BASE:-http://127.0.0.1:8000/mcp}"
USER_ID="${USER_ID:-596c7e07-b277-494a-9c66-0dc453719dc8}"
PROJECT_ID="${PROJECT_ID:-cd8d71f7-5de1-4f49-a2c3-5ebf56773c67}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/forecast_charts}"

HDR=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

mcp_call() {
  local id="$1"
  local tool="$2"
  local args="$3"
  local timeout="${4:-60}"
  curl -s --max-time "$timeout" -X POST "$BASE" "${HDR[@]}" \
    -H "mcp-session-id: $SESSION" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}"
}

parse_sse_json() {
  python3 -c '
import json, sys
raw = sys.stdin.read()
for line in raw.splitlines():
    line = line.strip().removeprefix("\ufeff")
    if not line.startswith("data:"):
        continue
    payload = json.loads(line[5:].strip())
    if payload.get("error"):
        err = payload["error"]
        msg = err.get("message", err) if isinstance(err, dict) else str(err)
        print(json.dumps({"success": False, "error": msg}))
        raise SystemExit(1)
    result = payload.get("result") or {}
    if result.get("isError"):
        text = (result.get("content") or [{}])[0].get("text", "tool error")
        print(json.dumps({"success": False, "error": text}))
        raise SystemExit(1)
    if isinstance(result, dict) and result.get("structuredContent") is not None:
        print(json.dumps(result["structuredContent"]))
    else:
        print(result["content"][0]["text"])
    raise SystemExit(0)
print(json.dumps({"success": False, "error": "no data event in SSE response"}))
raise SystemExit(1)
'
}

echo "=== 1) Initialize session ==="
SESSION=$(curl -si -X POST "$BASE" "${HDR[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"forecast-curl","version":"1.0.0"}}}' \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="mcp-session-id" {print $2}' | tail -1)

if [ -z "$SESSION" ]; then
  echo "ERROR: no mcp-session-id. Is port-forward running?"
  echo "  kubectl port-forward svc/mi-servidor-mcp 8000:8000"
  exit 1
fi
echo "SESSION=$SESSION"
echo ""

echo "=== 2) material_price_forecast ==="
FORECAST_JSON=$(mcp_call 2 material_price_forecast \
  "{\"user_id\":\"$USER_ID\",\"project_id\":\"$PROJECT_ID\",\"horizon_months\":6,\"trigger\":\"manual\"}" \
  90 | parse_sse_json)

RUN_ID=$(printf '%s' "$FORECAST_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("run_id") or "")')
DELTA=$(printf '%s' "$FORECAST_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); bi=d.get("budget_impact") or {}; print(bi.get("estimated_indexed_delta_pct", ""))')
PLANNED=$(printf '%s' "$FORECAST_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); bi=d.get("budget_impact") or {}; print(bi.get("total_budget_subtotal", ""))')
PROJECTED=$(printf '%s' "$FORECAST_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); bi=d.get("budget_impact") or {}; print(bi.get("projected_subtotal", ""))')

echo "RUN_ID=$RUN_ID"
echo "budget: planned=$PLANNED projected=$PROJECTED delta=${DELTA}%"
echo ""

if [ -z "$RUN_ID" ]; then
  echo "ERROR: forecast returned no run_id (persist disabled or tables missing?)"
  exit 1
fi

echo "=== 3) material_price_forecast_chart ==="
if ! CHART_JSON=$(mcp_call 3 material_price_forecast_chart \
  "{\"user_id\":\"$USER_ID\",\"run_id\":\"$RUN_ID\",\"project_id\":\"$PROJECT_ID\"}" \
  60 | parse_sse_json); then
  echo "$CHART_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ERROR:", d.get("error"))'
  echo ""
  echo "If error is 'Unknown tool', rebuild and redeploy the MCP image (chart tool is new)."
  exit 1
fi

mkdir -p "$OUT_DIR"
CHART_JSON="$CHART_JSON" OUT_DIR="$OUT_DIR" python3 <<'PY'
import json, os, re

data = json.loads(os.environ["CHART_JSON"])
out_dir = os.environ["OUT_DIR"]

pc = data.get("project_chart") or {}
project_svg = pc.get("svg") or ""
if project_svg:
    path = os.path.join(out_dir, "forecast_project.svg")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(project_svg)
    print(f"saved {path}")

for chart in data.get("supply_charts") or []:
    name = chart.get("supply_name") or chart.get("supply_id") or "supply"
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "supply"
    path = os.path.join(out_dir, f"forecast_{safe}.svg")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(chart.get("svg") or "")
    print(f"saved {path}")

print(f"charts={data.get('chart_count', 0)} run_id={data.get('run_id')}")
PY

echo ""
echo "Done. Open SVGs in: $OUT_DIR"
