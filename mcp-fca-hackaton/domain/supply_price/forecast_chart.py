"""Generate plan-vs-forecast charts from material_price_forecast output."""

from __future__ import annotations

import base64
import html
import logging
from typing import Any

from domain.project import postgres_read as sb
from domain.supply_price import postgres_supply_read as supply_read

logger = logging.getLogger("mcp-forecast-chart")

CHART_WIDTH = 720
CHART_HEIGHT = 320
MARGIN = {"top": 36, "right": 24, "bottom": 48, "left": 72}


def _error(message: str, **extra: Any) -> dict[str, Any]:
    return {"success": False, "error": message, **extra}


def _ok(**payload: Any) -> dict[str, Any]:
    return {"success": True, **payload}


def _svg_data_uri(svg: str) -> str:
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _scale_points(
    values: list[float], height: int, y_min: float, y_max: float
) -> list[float]:
    span = y_max - y_min or 1.0
    inner_h = height - MARGIN["top"] - MARGIN["bottom"]
    return [
        MARGIN["top"] + inner_h * (1 - (v - y_min) / span) for v in values
    ]


def _x_positions(count: int, width: int) -> list[float]:
    inner_w = width - MARGIN["left"] - MARGIN["right"]
    if count <= 1:
        return [MARGIN["left"] + inner_w / 2]
    step = inner_w / (count - 1)
    return [MARGIN["left"] + step * i for i in range(count)]


def render_supply_timeline_chart(
    *,
    supply_name: str,
    dates: list[str],
    plan_values: list[float],
    forecast_values: list[float],
    lower: list[float] | None = None,
    upper: list[float] | None = None,
    observation_dates: list[str] | None = None,
    observation_values: list[float] | None = None,
    width: int = CHART_WIDTH,
    height: int = CHART_HEIGHT,
) -> str:
    """SVG line chart: budget plan (flat) vs forecast trajectory."""
    if not dates or not forecast_values:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
            f'<text x="20" y="40">No forecast points for {html.escape(supply_name)}</text></svg>'
        )

    all_y = list(plan_values) + list(forecast_values)
    if lower:
        all_y.extend(lower)
    if upper:
        all_y.extend(upper)
    if observation_values:
        all_y.extend(observation_values)

    y_min = min(all_y) * 0.95
    y_max = max(all_y) * 1.05
    xs = _x_positions(len(dates), width)
    plan_y = _scale_points(plan_values, height, y_min, y_max)
    forecast_y = _scale_points(forecast_values, height, y_min, y_max)

    def polyline(points: list[tuple[float, float]], stroke: str, dash: str | None = None) -> str:
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        return (
            f'<polyline fill="none" stroke="{stroke}" stroke-width="2.5"{dash_attr} points="{pts}"/>'
        )

    plan_pts = list(zip(xs, plan_y))
    forecast_pts = list(zip(xs, forecast_y))

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="#fafafa"/>',
        f'<text x="{MARGIN["left"]}" y="22" font-family="sans-serif" font-size="14" '
        f'font-weight="600">{html.escape(supply_name)}</text>',
        f'<text x="{MARGIN["left"]}" y="38" font-family="sans-serif" font-size="11" fill="#555">'
        f"Plan (budget unit price) vs forecast</text>",
    ]

    if lower and upper and len(lower) == len(dates):
        band_top = _scale_points(upper, height, y_min, y_max)
        band_bot = _scale_points(lower, height, y_min, y_max)
        band_path = ["M"]
        for i, x in enumerate(xs):
            band_path.append(f"{x:.1f},{band_top[i]:.1f}")
        band_path.append("L")
        for i in range(len(xs) - 1, -1, -1):
            band_path.append(f"{xs[i]:.1f},{band_bot[i]:.1f}")
        band_path.append("Z")
        parts.append(
            f'<path d="{" ".join(band_path)}" fill="#2563eb" fill-opacity="0.12"/>'
        )

    parts.append(polyline(plan_pts, "#64748b", dash="6,4"))
    parts.append(polyline(forecast_pts, "#2563eb"))

    if observation_dates and observation_values:
        obs_x_map = {d: i for i, d in enumerate(dates)}
        obs_pts = []
        for d, v in zip(observation_dates, observation_values):
            if d in obs_x_map:
                idx = obs_x_map[d]
                oy = _scale_points([v], height, y_min, y_max)[0]
                obs_pts.append((xs[idx], oy))
            elif dates and d < dates[0]:
                continue
        for x, y in obs_pts[:12]:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#16a34a"/>')

    for i, label in enumerate(dates):
        if i == 0 or i == len(dates) - 1 or i % max(1, len(dates) // 4) == 0:
            parts.append(
                f'<text x="{xs[i]:.1f}" y="{height - 12}" text-anchor="middle" '
                f'font-family="sans-serif" font-size="10" fill="#444">{html.escape(label[:7])}</text>'
            )

    parts.append(
        f'<text x="8" y="{MARGIN["top"] + 8}" font-family="sans-serif" font-size="10" '
        f'fill="#64748b">{y_max:.2f}</text>'
    )
    parts.append(
        f'<text x="8" y="{height - MARGIN["bottom"]}" font-family="sans-serif" '
        f'font-size="10" fill="#64748b">{y_min:.2f}</text>'
    )

    legend_y = 52
    parts.extend(
        [
            f'<line x1="{width - 200}" y1="{legend_y}" x2="{width - 170}" y2="{legend_y}" '
            f'stroke="#64748b" stroke-width="2.5" stroke-dasharray="6,4"/>',
            f'<text x="{width - 165}" y="{legend_y + 4}" font-family="sans-serif" '
            f'font-size="10">Plan (budget)</text>',
            f'<line x1="{width - 200}" y1="{legend_y + 16}" x2="{width - 170}" '
            f'y2="{legend_y + 16}" stroke="#2563eb" stroke-width="2.5"/>',
            f'<text x="{width - 165}" y="{legend_y + 20}" font-family="sans-serif" '
            f'font-size="10">Forecast</text>',
            "</svg>",
        ]
    )
    return "".join(parts)


def render_project_budget_chart(
    *,
    project_label: str,
    planned: float,
    projected: float,
    width: int = CHART_WIDTH,
    height: int = 240,
) -> str:
    """SVG bar chart comparing total planned vs projected mapped budget."""
    inner_w = width - MARGIN["left"] - MARGIN["right"]
    bar_w = inner_w / 4
    max_val = max(planned, projected, 1.0) * 1.15
    inner_h = height - MARGIN["top"] - MARGIN["bottom"]
    base_y = height - MARGIN["bottom"]

    def bar_height(val: float) -> float:
        return inner_h * (val / max_val)

    x1 = MARGIN["left"] + inner_w * 0.25 - bar_w / 2
    x2 = MARGIN["left"] + inner_w * 0.75 - bar_w / 2
    h1 = bar_height(planned)
    h2 = bar_height(projected)

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        f'<rect width="{width}" height="{height}" fill="#fafafa"/>'
        f'<text x="{MARGIN["left"]}" y="22" font-family="sans-serif" font-size="14" '
        f'font-weight="600">{html.escape(project_label)}</text>'
        f'<text x="{MARGIN["left"]}" y="38" font-family="sans-serif" font-size="11" fill="#555">'
        f"Mapped supplies: planned budget vs projected cost</text>"
        f'<rect x="{x1:.1f}" y="{base_y - h1:.1f}" width="{bar_w:.1f}" height="{h1:.1f}" '
        f'fill="#64748b" rx="4"/>'
        f'<rect x="{x2:.1f}" y="{base_y - h2:.1f}" width="{bar_w:.1f}" height="{h2:.1f}" '
        f'fill="#2563eb" rx="4"/>'
        f'<text x="{x1 + bar_w / 2:.1f}" y="{base_y + 18}" text-anchor="middle" '
        f'font-family="sans-serif" font-size="11">Plan</text>'
        f'<text x="{x2 + bar_w / 2:.1f}" y="{base_y + 18}" text-anchor="middle" '
        f'font-family="sans-serif" font-size="11">Forecast</text>'
        f'<text x="{x1 + bar_w / 2:.1f}" y="{base_y - h1 - 6}" text-anchor="middle" '
        f'font-family="sans-serif" font-size="10">{planned:,.0f}</text>'
        f'<text x="{x2 + bar_w / 2:.1f}" y="{base_y - h2 - 6}" text-anchor="middle" '
        f'font-family="sans-serif" font-size="10">{projected:,.0f}</text>'
        f"</svg>"
    )


def _budget_context(
    user_id: str,
    project_id: str,
    access_token: str | None,
) -> tuple[dict[str, float], dict[str, str]]:
    budget = sb.get_project_budget_status(user_id, project_id, access_token=access_token)
    prices: dict[str, float] = {}
    names: dict[str, str] = {}
    if not budget.get("success"):
        return prices, names
    for item in budget.get("items") or []:
        link = item.get("activity_supplies") or {}
        sid = link.get("supply_id")
        if not sid:
            continue
        sid = str(sid)
        cat = link.get("supply_catalog") or {}
        if cat.get("nombre"):
            names[sid] = cat["nombre"]
        price = float(item.get("precio_unitario") or 0)
        if price:
            prices[sid] = price
    return prices, names


def _budget_prices_by_supply(
    user_id: str,
    project_id: str,
    access_token: str | None,
) -> dict[str, float]:
    prices, _ = _budget_context(user_id, project_id, access_token)
    return prices


def _supply_name_map(materials: list[dict[str, Any]]) -> dict[str, str]:
    return {
        str(m["supply_id"]): m.get("supply_name", str(m["supply_id"]))
        for m in materials
        if m.get("supply_id")
    }


def _build_supply_series(
    supply: dict[str, Any],
    budget_unit_price: float | None,
) -> dict[str, Any] | None:
    points = supply.get("points") or []
    if not points:
        return None

    dates = [str(p.get("forecast_date", ""))[:10] for p in points]
    forecast_values = [float(p.get("predicted_unit_price") or 0) for p in points]
    lower = [float(p.get("unit_price_index_lower") or 0) for p in points]
    upper = [float(p.get("unit_price_index_upper") or 0) for p in points]

    plan_price = budget_unit_price
    if plan_price is None:
        plan_price = float(supply.get("precio_unitario_budget") or 0) or None

    idx_values = [float(p.get("unit_price_index") or p.get("predicted_unit_price") or 0) for p in points]
    needs_index_scale = (
        plan_price
        and idx_values
        and abs(forecast_values[0] - plan_price) / plan_price > 0.2
        and abs(idx_values[0] - forecast_values[0]) < 0.01
    )

    if needs_index_scale and idx_values[0]:
        ratio = plan_price / idx_values[0]
        forecast_values = [v * ratio for v in forecast_values]
        lower = [v * ratio for v in lower]
        upper = [v * ratio for v in upper]
    elif not plan_price and forecast_values:
        plan_price = forecast_values[0]

    if not plan_price:
        return None

    lower_scaled = lower if lower and lower[0] else None
    upper_scaled = upper if upper and upper[0] else None

    obs = supply.get("observations") or []
    obs_dates = [str(o.get("observed_at", ""))[:10] for o in obs[-12:]]
    obs_vals = []
    index_ratio = (plan_price / idx_values[-1]) if idx_values and idx_values[-1] and needs_index_scale else 1.0
    for o in obs[-12:]:
        raw = float(o.get("unit_price") or 0)
        obs_vals.append(raw * index_ratio if index_ratio != 1.0 else raw)

    return {
        "supply_id": supply.get("supply_id"),
        "supply_name": supply.get("supply_name", "?"),
        "dates": dates,
        "plan_values": [plan_price] * len(dates),
        "forecast_values": forecast_values,
        "lower": lower_scaled,
        "upper": upper_scaled,
        "observation_dates": obs_dates,
        "observation_values": obs_vals,
        "series": {
            "plan": [{"date": d, "unit_price": plan_price} for d in dates],
            "forecast": [
                {
                    "date": d,
                    "unit_price": fv,
                    "lower": lo,
                    "upper": up,
                }
                for d, fv, lo, up in zip(dates, forecast_values, lower_scaled or lower, upper_scaled or upper)
            ],
        },
    }


def _forecasts_to_supply_points(
    forecasts: list[dict[str, Any]],
    budget_prices: dict[str, float],
    name_map: dict[str, str],
) -> list[dict[str, Any]]:
    by_supply: dict[str, list[dict[str, Any]]] = {}
    for row in forecasts:
        sid = str(row.get("supply_id", ""))
        by_supply.setdefault(sid, []).append(row)

    supplies = []
    for sid, rows in by_supply.items():
        rows.sort(key=lambda r: r.get("forecast_date", ""))
        points = []
        for row in rows:
            meta = row.get("metadata") or {}
            points.append(
                {
                    "forecast_date": row.get("forecast_date"),
                    "predicted_unit_price": row.get("predicted_unit_price"),
                    "unit_price_index": meta.get("unit_price_index"),
                    "unit_price_index_lower": meta.get("unit_price_index_lower"),
                    "unit_price_index_upper": meta.get("unit_price_index_upper"),
                }
            )
        supplies.append(
            {
                "supply_id": sid,
                "supply_name": name_map.get(sid, sid[:8]),
                "precio_unitario_budget": budget_prices.get(sid),
                "points": points,
                "observations": [],
            }
        )
    return supplies


def generate_material_price_forecast_chart(
    user_id: str,
    *,
    run_id: str | None = None,
    project_id: str | None = None,
    forecast_result: dict[str, Any] | None = None,
    supply_id: str | None = None,
    include_observations: bool = True,
    access_token: str | None = None,
) -> dict[str, Any]:
    """
    Build plan-vs-forecast charts from a material_price_forecast run or inline result.

    Plan = budget unit price (flat line). Forecast = predicted unit prices over the horizon.
    """
    payload = forecast_result
    resolved_project_id = project_id
    resolved_run_id = run_id

    if payload is None:
        if not run_id:
            if project_id:
                runs_resp = supply_read.list_supply_agent_runs(
                    user_id,
                    project_id,
                    status="completed",
                    limit=1,
                    access_token=access_token,
                )
                if runs_resp.get("success") and runs_resp.get("runs"):
                    run_id = runs_resp["runs"][0]["id"]
            if not run_id:
                return _error(
                    "Provide run_id, project_id (uses latest completed run), "
                    "or forecast_result from material_price_forecast.",
                    code="missing_run",
                )
        run_resp = supply_read.get_supply_agent_run(
            user_id,
            run_id,
            include_forecasts=True,
            include_alerts=False,
            access_token=access_token,
        )
        if not run_resp.get("success"):
            return run_resp
        run = run_resp.get("run") or {}
        resolved_project_id = run.get("project_id")
        resolved_run_id = run_id
        meta = run.get("metadata") or {}
        budget_impact = meta.get("budget_summary") or {}
        forecasts = run_resp.get("forecasts") or []
        if not forecasts:
            return _error(f"No forecasts stored for run {run_id}.", code="no_forecasts")

        assert resolved_project_id is not None
        budget_prices, name_map = _budget_context(
            user_id, str(resolved_project_id), access_token
        )
        supplies = _forecasts_to_supply_points(forecasts, budget_prices, name_map)
        payload = {
            "run_id": run_id,
            "project_id": resolved_project_id,
            "budget_impact": budget_impact,
            "materials": [
                {
                    "supply_id": sid,
                    "supply_name": name_map.get(sid, sid),
                    "precio_unitario_budget": price,
                }
                for sid, price in budget_prices.items()
            ],
            "supplies": supplies,
        }
    else:
        if not payload.get("success", True):
            return _error(
                payload.get("error", "Invalid forecast_result"),
                code="invalid_forecast_result",
            )
        resolved_run_id = payload.get("run_id") or run_id
        resolved_project_id = payload.get("project_id") or project_id

    budget_impact = payload.get("budget_impact") or {}
    supplies = payload.get("supplies") or []
    materials = payload.get("materials") or []
    name_map = _supply_name_map(materials)

    budget_prices = {
        str(m["supply_id"]): float(m.get("precio_unitario_budget") or 0)
        for m in materials
        if m.get("supply_id")
    }

    if supply_id:
        supplies = [s for s in supplies if str(s.get("supply_id")) == supply_id]
        if not supplies:
            return _error(f"Supply {supply_id} not found in forecast data.", code="not_found")

    charts: list[dict[str, Any]] = []
    for supply in supplies:
        sid = str(supply.get("supply_id", ""))
        if sid and sid in name_map:
            supply["supply_name"] = name_map[sid]
        series = _build_supply_series(supply, budget_prices.get(sid))
        if not series:
            continue

        obs_dates = series["observation_dates"] if include_observations else None
        obs_vals = series["observation_values"] if include_observations else None

        svg = render_supply_timeline_chart(
            supply_name=series["supply_name"],
            dates=series["dates"],
            plan_values=series["plan_values"],
            forecast_values=series["forecast_values"],
            lower=series.get("lower"),
            upper=series.get("upper"),
            observation_dates=obs_dates,
            observation_values=obs_vals,
        )
        charts.append(
            {
                "supply_id": series["supply_id"],
                "supply_name": series["supply_name"],
                "chart_type": "supply_timeline",
                "svg": svg,
                "image_data_uri": _svg_data_uri(svg),
                **series,
            }
        )

    planned = float(budget_impact.get("total_budget_subtotal") or 0)
    projected = float(budget_impact.get("projected_subtotal") or planned)
    project_label = f"Project {str(resolved_project_id or '')[:8]}"
    project_svg = render_project_budget_chart(
        project_label=project_label,
        planned=planned,
        projected=projected,
    )

    if not charts and not planned:
        return _error(
            "No chartable forecast data. Run material_price_forecast with mapped supplies first.",
            code="no_data",
        )

    return _ok(
        run_id=resolved_run_id,
        project_id=resolved_project_id,
        chart_count=len(charts),
        supply_charts=charts,
        project_chart={
            "chart_type": "project_budget",
            "planned_subtotal": planned,
            "projected_subtotal": projected,
            "delta_pct": budget_impact.get("estimated_indexed_delta_pct"),
            "svg": project_svg,
            "image_data_uri": _svg_data_uri(project_svg),
        },
        legend={
            "plan": "Budget unit price (flat) or mapped budget subtotal",
            "forecast": "Model-predicted unit price or projected subtotal",
            "band": "Forecast confidence band (index ± residual std)",
            "observations": "Historical market index scaled to budget (when available)",
        },
    )
