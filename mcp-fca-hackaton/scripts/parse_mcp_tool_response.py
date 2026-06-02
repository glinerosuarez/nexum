"""Parse MCP SSE tool response and print summary, detailed, or JSON output."""
import json
import os
import sys

tool_name = os.environ["TOOL_NAME"]
max_chars = int(os.environ.get("MAX_CHARS", "8000"))
output_mode = os.environ.get("OUTPUT_MODE", "detailed")
results_file = os.environ["RESULTS_FILE"]
raw = sys.stdin.read()


def clip(text, n=120):
    text = str(text).replace("\n", " ")
    return text if len(text) <= n else text[: n - 1] + "…"


def _metrics(data: dict) -> dict:
    return data.get("metrics") or {}


def _count_phase_activities(phases: list) -> int:
    return sum(len(p.get("activities") or []) for p in phases)


def _sum_budget_items(items: list) -> float:
    total = 0.0
    for item in items or []:
        sub = item.get("subtotal")
        if sub is None:
            sub = float(item.get("cantidad_planeada") or 0) * float(
                item.get("precio_unitario") or 0
            )
        total += float(sub or 0)
    return total


def _fmt_num(value, digits=2) -> str:
    if value is None:
        return "—"
    try:
        n = float(value)
    except (TypeError, ValueError):
        return str(value)
    if abs(n) >= 1_000_000:
        return f"{n / 1_000_000:.{digits}f}M"
    if abs(n) >= 1_000:
        return f"{n / 1_000:.{digits}f}K"
    return f"{n:.{digits}f}"


def _join_names(items: list, key="nombre", limit=3) -> str:
    names = [str(i.get(key) or "?") for i in (items or [])[:limit]]
    return ", ".join(names) if names else "—"


def summarize(tool: str, data: dict) -> str:
    lines = detail_lines(tool, data)
    return lines[0] if lines else clip(json.dumps(data, ensure_ascii=False)[:120])


def detail_lines(tool: str, data: dict) -> list[str]:
    if not isinstance(data, dict):
        return [clip(data)]

    if data.get("success") is False:
        return [clip(data.get("error", "error"))]

    if tool == "list_user_projects":
        projects = data.get("projects") or []
        return [
            f"count={data.get('count', len(projects))} | "
            f"{_join_names(projects)}",
            f"ids: {', '.join(str(p.get('id', '?'))[:8] for p in projects[:3])}",
        ]

    if tool == "get_project_summary":
        p = data.get("project") or {}
        m = _metrics(data)
        budget = m.get("latest_budget_snapshot") or {}
        report = m.get("latest_daily_report") or {}
        return [
            (
                f"{p.get('nombre', '?')} | estado={p.get('estado', '?')} | "
                f"progreso={m.get('average_progress_percentage', '—')}%"
            ),
            (
                f"phases={m.get('phase_count', '?')} activities={m.get('activity_count', '?')} | "
                f"open_incidents={m.get('open_incidents', 0)}"
            ),
            (
                f"budget v{budget.get('version_number', '?')} "
                f"total={_fmt_num(budget.get('total_budget'))} | "
                f"latest_report={report.get('fecha', '—')}"
            ),
        ]

    if tool == "list_project_phases_and_activities":
        phases = data.get("phases") or []
        act_count = _count_phase_activities(phases)
        phase_names = _join_names(phases)
        return [
            f"phases={data.get('phase_count', len(phases))} activities={act_count}",
            f"phases: {phase_names}",
            *[
                f"  · {p.get('nombre', '?')}: {len(p.get('activities') or [])} activities"
                for p in phases[:4]
            ],
        ]

    if tool == "get_activity_detail":
        a = (data.get("activity") or {}) if isinstance(data.get("activity"), dict) else {}
        if not a and isinstance(data.get("activity"), list):
            a = (data.get("activity") or [{}])[0]
        supplies = data.get("supplies") or []
        supply_names = []
        for s in supplies:
            cat = s.get("supply_catalog") or {}
            if cat.get("nombre"):
                supply_names.append(cat["nombre"])
        return [
            (
                f"{a.get('nombre', '?')} | progress={a.get('progress_percentage', '—')}% | "
                f"supplies={data.get('supply_count', len(supplies))}"
            ),
            (
                f"planned={a.get('cantidad_planeada', '—')} {a.get('unidad_medida', '')} | "
                f"executed={a.get('cantidad_ejecutada', '—')}"
            ),
            f"supplies: {', '.join(supply_names) if supply_names else '—'}",
        ]

    if tool == "get_project_budget_status":
        snap = data.get("snapshot") or {}
        items = data.get("items") or []
        total = _sum_budget_items(items)
        supply_names = []
        for item in items[:4]:
            link = item.get("activity_supplies") or {}
            cat = link.get("supply_catalog") or {}
            name = cat.get("nombre")
            if name:
                supply_names.append(name)
        return [
            (
                f"snapshot v{snap.get('version_number', '?')} | "
                f"items={data.get('item_count', len(items))} | "
                f"subtotal≈{_fmt_num(total)}"
            ),
            f"estado={snap.get('estado', '—')} date={snap.get('snapshot_date', '—')}",
            f"lines: {', '.join(supply_names) if supply_names else '—'}",
        ]

    if tool == "list_daily_reports":
        reports = data.get("reports") or []
        dates = [r.get("fecha", "?") for r in reports[:3]]
        return [
            f"count={data.get('count', len(reports))}",
            f"dates: {', '.join(dates) if dates else '—'}",
        ]

    if tool == "get_daily_report_detail":
        r = data.get("report") or {}
        items = data.get("items") or []
        act_names = []
        for item in items[:3]:
            act = item.get("activities") or {}
            if act.get("nombre"):
                act_names.append(act["nombre"])
        return [
            (
                f"fecha={r.get('fecha', '?')} | items={data.get('item_count', len(items))} | "
                f"personal={r.get('personal_presente', '—')}"
            ),
            f"activities: {', '.join(act_names) if act_names else '—'}",
        ]

    if tool == "list_project_incidents":
        incidents = data.get("incidents") or []
        bits = [
            f"{i.get('tipo', '?')}/{i.get('severidad', '?')}"
            for i in incidents[:3]
        ]
        return [
            f"count={data.get('count', len(incidents))}",
            f"open: {', '.join(bits) if bits else '—'}",
        ]

    if tool == "get_incident_detail":
        i = data.get("incident") or data
        actions = data.get("actions") or []
        return [
            (
                f"{i.get('tipo', '?')} | severidad={i.get('severidad', '?')} | "
                f"estado={i.get('estado', '?')}"
            ),
            f"descripcion: {clip(i.get('descripcion', '—'), 80)}",
            f"actions={data.get('action_count', len(actions))}",
        ]

    if tool == "get_supply_catalog_search":
        supplies = data.get("supplies") or []
        alerts = data.get("open_alerts") or []
        return [
            f"query='{data.get('query', '?')}' count={data.get('count', len(supplies))}",
            f"matches: {_join_names(supplies) if supplies else 'none'}",
            f"open_alerts={len(alerts)}",
        ]

    if tool == "get_schedule_status":
        items = data.get("items") or []
        baseline = data.get("baseline") or {}
        return [
            (
                f"items={data.get('item_count', len(items))} | "
                f"overdue={data.get('overdue_count', 0)}"
            ),
            f"baseline={baseline.get('nombre', baseline.get('id', '—'))}",
            f"sample: {_join_names([i.get('activities') or {} for i in items[:3]])}",
        ]

    if tool == "list_overdue_schedule_items":
        items = data.get("items") or []
        names = []
        for item in items[:3]:
            act = item.get("activities") or {}
            names.append(act.get("nombre", "?"))
        return [
            f"overdue={data.get('count', len(items))}",
            f"activities: {', '.join(names) if names else '—'}",
        ]

    if tool == "list_purchase_orders":
        orders = data.get("purchase_orders") or []
        bits = [f"{o.get('numero', o.get('id', '?')[:8])}/{o.get('estado', '?')}" for o in orders[:3]]
        return [
            f"count={data.get('count', len(orders))}",
            f"orders: {', '.join(bits) if bits else '—'}",
        ]

    if tool == "get_purchase_order_detail":
        po = data.get("purchase_order") or {}
        supplier = data.get("supplier") or po.get("suppliers") or {}
        return [
            f"PO {po.get('numero', po.get('id', '?')[:8])} | estado={po.get('estado', '?')}",
            f"supplier={supplier.get('nombre', '—')} | items={data.get('item_count', 0)}",
            f"payments={data.get('payment_count', 0)} total={_fmt_num(po.get('total'))}",
        ]

    if tool == "search_suppliers":
        suppliers = data.get("suppliers") or []
        return [
            f"query='{data.get('query', '?')}' count={data.get('count', len(suppliers))}",
            f"matches: {_join_names(suppliers)}",
        ]

    if tool == "list_payroll_periods":
        periods = data.get("payroll_periods") or []
        bits = [p.get("periodo") or p.get("fecha_inicio", "?") for p in periods[:3]]
        return [
            f"count={data.get('count', len(periods))}",
            f"periods: {', '.join(str(b) for b in bits) if bits else '—'}",
        ]

    if tool == "get_payroll_period_detail":
        p = data.get("payroll_period") or {}
        return [
            (
                f"periodo={p.get('periodo', p.get('fecha_inicio', '?'))} | "
                f"entries={data.get('entry_count', 0)} | "
                f"total_neto={_fmt_num(data.get('total_neto'))}"
            ),
            f"estado={p.get('estado', '—')}",
        ]

    if tool == "list_project_team":
        team = data.get("team") or []
        members = []
        for m in team[:4]:
            profile = m.get("profiles") or {}
            name = profile.get("full_name") or profile.get("email") or "?"
            members.append(f"{name}/{m.get('role', '?')}")
        return [
            f"members={data.get('count', len(team))}",
            f"team: {', '.join(members) if members else '—'}",
        ]

    if tool == "material_price_forecast_chart":
        charts = data.get("supply_charts") or []
        pc = data.get("project_chart") or {}
        names = [c.get("supply_name") for c in charts[:2]]
        return [
            (
                f"charts={data.get('chart_count', 0)} | run={str(data.get('run_id', ''))[:8]}… | "
                f"supplies: {', '.join(n for n in names if n) or '—'}"
            ),
            (
                f"project budget {_fmt_num(pc.get('planned_subtotal'))} → "
                f"{_fmt_num(pc.get('projected_subtotal'))} | "
                f"delta={pc.get('delta_pct', '—')}%"
            ),
            "formats: svg + image_data_uri per chart",
        ]

    if tool == "material_price_forecast":
        bi = data.get("budget_impact") or {}
        run = data.get("run") or {}
        materials = data.get("materials") or []
        unmapped = data.get("unmapped_supplies") or []
        errors = data.get("supply_errors") or []
        mat_bits = [
            f"{m.get('supply_name', '?')} ({m.get('forecast_pct_change', '—')}%)"
            for m in materials[:4]
        ]
        return [
            (
                f"run={str(data.get('run_id', ''))[:8]}… | "
                f"mapped={data.get('material_count', len(materials))} "
                f"unmapped={len(unmapped)} | "
                f"delta={bi.get('estimated_indexed_delta_pct', '—')}% | "
                f"alerts={len(data.get('alerts') or [])}"
            ),
            (
                f"budget {_fmt_num(bi.get('total_budget_subtotal'))} → "
                f"{_fmt_num(bi.get('projected_subtotal'))} | "
                f"overrun={bi.get('overrun_triggered', False)} | "
                f"duration={run.get('duration_ms', '—')}ms"
            ),
            f"materials: {', '.join(mat_bits) if mat_bits else '—'}",
            (
                f"errors={len(errors)} | "
                f"counters: processed={run.get('counters', {}).get('supplies_processed', '—')} "
                f"obs={run.get('counters', {}).get('observations_written', '—')} "
                f"forecasts={run.get('counters', {}).get('forecasts_written', '—')}"
            ),
        ]

    if tool == "list_supply_agent_runs":
        runs = data.get("runs") or []
        latest = runs[0] if runs else {}
        meta = latest.get("metadata") or {}
        return [
            f"count={data.get('count', len(runs))} | latest={latest.get('status', '?')} {str(latest.get('id', ''))[:8]}",
            (
                f"trigger={meta.get('trigger', '—')} horizon={meta.get('horizon_months', '—')}mo | "
                f"errors={meta.get('counters', {}).get('errors', '—')}"
            ),
        ]

    if tool == "get_supply_agent_run":
        run = data.get("run") or {}
        meta = run.get("metadata") or {}
        bs = meta.get("budget_summary") or {}
        return [
            f"status={run.get('status', '?')} | alerts={data.get('alert_count', 0)} | forecasts={data.get('forecast_count', 0)}",
            f"delta={bs.get('estimated_indexed_delta_pct', '—')}% overrun={bs.get('overrun_triggered', '—')}",
        ]

    if tool == "list_supply_cost_overrun_alerts":
        alerts = data.get("alerts") or []
        latest = alerts[0] if alerts else {}
        return [
            f"count={data.get('count', len(alerts))}",
            (
                f"latest: severity={latest.get('severity', '—')} "
                f"overrun={latest.get('overrun_pct', '—')}% "
                f"status={latest.get('status', '—')}"
                if latest
                else "latest: —"
            ),
        ]

    if tool == "list_supply_cost_forecasts":
        forecasts = data.get("forecasts") or []
        latest = forecasts[0] if forecasts else {}
        return [
            f"count={data.get('count', len(forecasts))}",
            (
                f"latest: {latest.get('forecast_date', '—')} "
                f"price={latest.get('predicted_unit_price', '—')} "
                f"supply={str(latest.get('supply_id', ''))[:8]}"
                if latest
                else "latest: —"
            ),
        ]

    if tool == "list_supply_price_sources":
        sources = data.get("sources") or []
        bits = [s.get("source_name", "?") for s in sources[:3]]
        return [
            f"count={data.get('count', len(sources))} | {', '.join(bits)}",
            f"supply_id={str(data.get('supply_id', '—'))[:8]}…",
        ]

    if tool == "list_supply_price_observations":
        obs = data.get("observations") or []
        latest = obs[0] if obs else {}
        oldest = obs[-1] if obs else {}
        return [
            (
                f"count={data.get('count', len(obs))} | "
                f"latest={latest.get('observed_at', '—')} @ {latest.get('unit_price', '—')}"
            ),
            (
                f"range: {oldest.get('observed_at', '—')} → {latest.get('observed_at', '—')}"
                if obs
                else "range: —"
            ),
        ]

    if tool == "langgraph_agent_orchestrator":
        tools = [t.get("name") for t in (data.get("tools_used") or [])[:5]]
        return [
            f"backend={data.get('backend', '?')} | tools={', '.join(tools) or 'none'}",
            f"result: {clip(data.get('final_result', ''), 100)}",
        ]

    if "count" in data:
        return [f"count={data['count']}"]
    if "message" in data:
        return [clip(data["message"])]
    return [clip(json.dumps(data, ensure_ascii=False)[:120])]


def record(status: str, summary: str) -> None:
    with open(results_file, "a", encoding="utf-8") as fh:
        fh.write(f"{tool_name}\t{status}\t{summary}\n")


def finish(ok: bool, status: str, inner=None, body: str = "") -> None:
    summary = body if not ok else summarize(tool_name, inner or {})
    record("PASS" if ok else "FAIL", summary if ok else (body or summary))
    if output_mode == "json" and ok and inner is not None:
        print(f"[{tool_name}] {status}")
        out = json.dumps(inner, indent=2, ensure_ascii=False)
        if max_chars > 0 and len(out) > max_chars:
            out = out[:max_chars] + "\n  ... [truncated — OUTPUT_MODE=json OUTPUT_MAX_CHARS=0 for full]"
        for line in out.splitlines():
            print(f"  {line}")
    elif output_mode == "json" and not ok:
        print(f"[{tool_name}] {status}")
        if body:
            for line in body.splitlines():
                print(f"  {line}")
    else:
        mark = "OK" if ok else "FAIL"
        if output_mode == "detailed" and ok and inner is not None:
            lines = detail_lines(tool_name, inner)
            print(f"[{mark}] {tool_name}")
            for line in lines:
                print(f"  {line}")
        else:
            print(f"[{mark}] {tool_name:<36} {summary}")
    print()
    raise SystemExit(0 if ok else 1)


for line in raw.splitlines():
    line = line.strip().removeprefix("\ufeff")
    if line.startswith(":"):
        continue
    if not line.startswith("data:"):
        continue
    try:
        payload = json.loads(line[5:].strip())
    except json.JSONDecodeError as exc:
        finish(False, f"FAIL parse: {exc}", body=str(exc))

    if payload.get("error"):
        err = payload["error"]
        msg = err.get("message", err) if isinstance(err, dict) else str(err)
        finish(False, "FAIL", body=str(msg))

    try:
        result = payload["result"]
        if isinstance(result, dict) and result.get("structuredContent") is not None:
            inner = result["structuredContent"]
        else:
            text = result["content"][0]["text"]
            inner = json.loads(text) if text.startswith("{") else {"raw": text}
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        finish(False, f"FAIL missing result payload: {exc}", body=str(exc))

    if isinstance(inner, dict) and (inner.get("success") is False or inner.get("error")):
        body = inner.get("error") or json.dumps(inner, ensure_ascii=False)
        finish(False, "FAIL", body=str(body))

    finish(True, "OK", inner=inner)

finish(False, "FAIL (no data event — timeout or still running?)", body="no data event")
