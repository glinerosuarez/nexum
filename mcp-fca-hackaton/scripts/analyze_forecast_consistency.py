#!/usr/bin/env python3
"""Run MCP tools twice and cross-check project budget vs forecast math."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from typing import Any

BASE = "http://127.0.0.1:8000/mcp"
USER_ID = "596c7e07-b277-494a-9c66-0dc453719dc8"
PROJECT_ID = "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67"


def post_mcp(session: str | None, payload: dict, timeout: int = 90) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session:
        headers["mcp-session-id"] = session
    req = urllib.request.Request(
        BASE,
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if not session:
            session = resp.headers.get("mcp-session-id")
        raw = resp.read().decode()
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            return {"session": session, "payload": json.loads(line[5:])}
    raise RuntimeError("no SSE data event")


def call_tool(session: str, tool_id: int, name: str, arguments: dict, timeout: int = 90) -> dict:
    out = post_mcp(
        session,
        {
            "jsonrpc": "2.0",
            "id": tool_id,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        },
        timeout=timeout,
    )
    result = out["payload"].get("result") or {}
    if result.get("isError"):
        raise RuntimeError(result["content"][0]["text"])
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    return json.loads(result["content"][0]["text"])


def init_session() -> str:
    out = post_mcp(
        None,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "analyze", "version": "1.0"},
            },
        },
    )
    sid = out["session"]
    if not sid:
        raise RuntimeError("no session id")
    return sid


def extract_budget_supplies(budget: dict) -> list[dict]:
    grouped: dict[str, dict] = {}
    for item in budget.get("items") or []:
        link = item.get("activity_supplies") or {}
        cat = link.get("supply_catalog") or {}
        name = (cat.get("nombre") or "").strip()
        if not name:
            continue
        sid = str(link.get("supply_id") or name.lower())
        qty = float(item.get("cantidad_planeada") or 0)
        price = float(item.get("precio_unitario") or 0)
        sub = float(item.get("subtotal") or qty * price)
        bucket = grouped.setdefault(
            sid,
            {
                "supply_id": link.get("supply_id"),
                "supply_name": name,
                "subtotal_budget": 0.0,
                "precio_unitario_budget": price,
            },
        )
        bucket["subtotal_budget"] += sub
        if price:
            bucket["precio_unitario_budget"] = price
    return list(grouped.values())


def forecast_fingerprint(fc: dict) -> dict:
    bi = fc.get("budget_impact") or {}
    mats = fc.get("materials") or []
    return {
        "material_count": fc.get("material_count"),
        "mapped_subtotal": round(bi.get("total_budget_subtotal", 0), 2),
        "projected_subtotal": round(bi.get("projected_subtotal", 0), 2),
        "delta_pct": bi.get("estimated_indexed_delta_pct"),
        "delta_amount": round(bi.get("estimated_indexed_delta", 0), 2),
        "overrun_triggered": bi.get("overrun_triggered"),
        "materials": sorted(
            [
                {
                    "supply_name": m.get("supply_name"),
                    "subtotal": round(float(m.get("subtotal_budget") or 0), 2),
                    "pct": m.get("forecast_pct_change"),
                    "delta": round(float(m.get("estimated_budget_delta") or 0), 2),
                }
                for m in mats
            ],
            key=lambda x: x["supply_name"] or "",
        ),
        "unmapped_count": len(fc.get("unmapped_supplies") or []),
        "error_count": len(fc.get("supply_errors") or []),
    }


def main() -> int:
    print("=== MCP forecast consistency analysis (2 runs) ===\n")
    session = init_session()
    print(f"session={session[:16]}…\n")

    budget = call_tool(
        session,
        2,
        "get_project_budget_status",
        {"user_id": USER_ID, "project_id": PROJECT_ID},
    )
    summary = call_tool(
        session,
        3,
        "get_project_summary",
        {"user_id": USER_ID, "project_id": PROJECT_ID},
    )

    budget_supplies = extract_budget_supplies(budget)
    total_budget_items = sum(float(i.get("subtotal") or 0) for i in budget.get("items") or [])
    snap = budget.get("snapshot") or {}
    metrics = summary.get("metrics") or {}

    print("--- Project baseline ---")
    print(f"project: {summary.get('project', {}).get('nombre')}")
    print(f"budget snapshot v{snap.get('version_number')} | items={budget.get('item_count')} | DB total_budget={snap.get('total_budget')}")
    print(f"sum(line subtotals)={total_budget_items:,.2f}")
    print(f"metrics.total_budget_snapshot={metrics.get('latest_budget_snapshot', {}).get('total_budget')}")
    print(f"unique supplies in budget: {len(budget_supplies)}")
    for s in budget_supplies:
        print(f"  · {s['supply_name']}: subtotal={s['subtotal_budget']:,.2f} unit={s['precio_unitario_budget']:,.2f}")
    print()

    fc1 = call_tool(
        session,
        4,
        "material_price_forecast",
        {
            "user_id": USER_ID,
            "project_id": PROJECT_ID,
            "horizon_months": 6,
            "trigger": "manual",
        },
        timeout=120,
    )
    fc2 = call_tool(
        session,
        5,
        "material_price_forecast",
        {
            "user_id": USER_ID,
            "project_id": PROJECT_ID,
            "horizon_months": 6,
            "trigger": "manual",
        },
        timeout=120,
    )

    fp1 = forecast_fingerprint(fc1)
    fp2 = forecast_fingerprint(fc2)

    print("--- Forecast run 1 ---")
    print(f"run_id={fc1.get('run_id')} duration={fc1.get('run', {}).get('duration_ms')}ms")
    print(json.dumps(fp1, indent=2))
    print()

    print("--- Forecast run 2 ---")
    print(f"run_id={fc2.get('run_id')} duration={fc2.get('run', {}).get('duration_ms')}ms")
    print(json.dumps(fp2, indent=2))
    print()

    print("--- Run 1 vs Run 2 (should match except run_id) ---")
    equal = fp1 == fp2
    print(f"fingerprints equal: {equal}")
    if not equal:
        for key in sorted(set(fp1) | set(fp2)):
            if fp1.get(key) != fp2.get(key):
                print(f"  DIFF {key}: {fp1.get(key)!r} vs {fp2.get(key)!r}")
    print()

    print("--- Cross-check: budget vs forecast materials ---")
    bi = fc1.get("budget_impact") or {}
    mapped_names = {m["supply_name"] for m in fc1.get("materials") or []}
    unmapped = fc1.get("unmapped_supplies") or []

    recomputed_mapped_subtotal = sum(float(m.get("subtotal_budget") or 0) for m in fc1.get("materials") or [])
    recomputed_delta = sum(float(m.get("estimated_budget_delta") or 0) for m in fc1.get("materials") or [])
    recomputed_projected = recomputed_mapped_subtotal + recomputed_delta

    checks = [
        (
            "mapped subtotal == sum(materials.subtotal_budget)",
            abs(recomputed_mapped_subtotal - float(bi.get("total_budget_subtotal") or 0)) < 0.02,
            f"{recomputed_mapped_subtotal:,.2f} vs {bi.get('total_budget_subtotal')}",
        ),
        (
            "projected == mapped + delta",
            abs(recomputed_projected - float(bi.get("projected_subtotal") or 0)) < 0.02,
            f"{recomputed_projected:,.2f} vs {bi.get('projected_subtotal')}",
        ),
        (
            "delta amount == sum(material deltas)",
            abs(recomputed_delta - float(bi.get("estimated_indexed_delta") or 0)) < 0.02,
            f"{recomputed_delta:,.2f} vs {bi.get('estimated_indexed_delta')}",
        ),
        (
            "mapped + unmapped covers all budget supplies",
            len(mapped_names) + len(unmapped) == len(budget_supplies),
            f"mapped={len(mapped_names)} unmapped={len(unmapped)} budget={len(budget_supplies)}",
        ),
    ]

    for label, ok, detail in checks:
        mark = "OK" if ok else "FAIL"
        print(f"  [{mark}] {label} ({detail})")

    print()
    print("--- Mapped vs unmapped ---")
    print(f"Mapped ({len(mapped_names)}): {', '.join(sorted(mapped_names))}")
    print(f"Unmapped ({len(unmapped)}): {', '.join(u.get('supply_name', '?') for u in unmapped)}")

    print()
    print("--- Per-material delta math (subtotal × pct/100) ---")
    for m in fc1.get("materials") or []:
        sub = float(m.get("subtotal_budget") or 0)
        pct = float(m.get("forecast_pct_change") or 0)
        expected = round(sub * pct / 100, 2)
        actual = round(float(m.get("estimated_budget_delta") or 0), 2)
        ok = abs(expected - actual) < 0.02
        print(
            f"  [{'OK' if ok else 'FAIL'}] {m.get('supply_name')}: "
            f"{sub:,.0f} × {pct}% = {expected:,.2f} (reported {actual:,.2f})"
        )

    print()
    print("--- Interpretation ---")
    print(
        "Forecast applies US FRED PPI % change to mapped budget subtotals only. "
        f"Project full budget sum is {total_budget_items:,.0f}; "
        f"forecast scope is {bi.get('total_budget_subtotal'):,.0f} ({len(mapped_names)}/{len(budget_supplies)} supplies)."
    )

    return 0 if equal and all(c[1] for c in checks) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.URLError as exc:
        print(f"ERROR: cannot reach MCP at {BASE}: {exc}", file=sys.stderr)
        print("  kubectl port-forward svc/mi-servidor-mcp 8000:8000", file=sys.stderr)
        raise SystemExit(2)
