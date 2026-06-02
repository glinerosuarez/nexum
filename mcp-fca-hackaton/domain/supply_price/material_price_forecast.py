"""Material price forecast tool: project supplies + market data + budget impact."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

from domain.project import postgres_read as sb
from domain.supply_price import supply_price_store as store
from domain.supply_price.price_data import (
    fetch_from_source,
    fetch_historical_prices,
    resolve_supply_to_series,
    series_entry_to_virtual_source,
)
from domain.supply_price.price_forecast import forecast_series

logger = logging.getLogger("mcp-material-price-forecast")


def _error(message: str, **extra: Any) -> dict[str, Any]:
    return {"success": False, "error": message, **extra}


def _ok(**payload: Any) -> dict[str, Any]:
    return {"success": True, **_json_safe(payload)}


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _extract_budget_supplies(budget: dict[str, Any]) -> list[dict[str, Any]]:
    """Aggregate budget line items by supply id (fallback name key)."""
    grouped: dict[str, dict[str, Any]] = {}
    for item in budget.get("items") or []:
        link = item.get("activity_supplies") or {}
        catalog = link.get("supply_catalog") or {}
        nombre = (catalog.get("nombre") or "").strip()
        if not nombre:
            continue

        supply_id = link.get("supply_id")
        group_key = str(supply_id) if supply_id else nombre.lower()

        cantidad = float(item.get("cantidad_planeada") or 0)
        precio = float(item.get("precio_unitario") or 0)
        subtotal = float(item.get("subtotal") or cantidad * precio)

        bucket = grouped.setdefault(
            group_key,
            {
                "supply_name": nombre,
                "unidad_medida": catalog.get("unidad_medida"),
                "supply_id": supply_id,
                "cantidad_planeada": 0.0,
                "precio_unitario_budget": precio,
                "subtotal_budget": 0.0,
            },
        )
        bucket["cantidad_planeada"] += cantidad
        bucket["subtotal_budget"] += subtotal
        if precio:
            bucket["precio_unitario_budget"] = precio

    return list(grouped.values())


def _matches_material_filter(supply_name: str, material_queries: list[str]) -> bool:
    name_norm = supply_name.lower()
    for query in material_queries:
        q = query.strip().lower()
        if q and q in name_norm:
            return True
    return False


def _selected_supply_metadata(supply: dict[str, Any]) -> dict[str, Any]:
    return {
        "supply_id": supply.get("supply_id"),
        "supply_name": supply.get("supply_name"),
        "unidad_medida": supply.get("unidad_medida"),
        "cantidad_planeada": supply.get("cantidad_planeada"),
        "precio_unitario_budget": supply.get("precio_unitario_budget"),
        "subtotal_budget": supply.get("subtotal_budget"),
    }


def _supply_error(
    supply: dict[str, Any],
    *,
    stage: str,
    code: str,
    message: str,
    source_id: str | None = None,
    retriable: bool = False,
) -> dict[str, Any]:
    return {
        "supply_id": supply.get("supply_id"),
        "supply_name": supply.get("supply_name"),
        "stage": stage,
        "code": code,
        "message": message,
        "source_id": source_id,
        "retriable": retriable,
    }


def _resolve_source_for_supply(
    supply: dict[str, Any],
    sources_by_supply: dict[str, list[dict[str, Any]]],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    supply_id = supply.get("supply_id")
    if supply_id:
        db_sources = sources_by_supply.get(str(supply_id)) or []
        if db_sources:
            return store.source_to_series(db_sources[0]), None

    series = resolve_supply_to_series(supply["supply_name"])
    if series:
        virtual = series_entry_to_virtual_source(series)
        return store.source_to_series(virtual), None

    return None, _supply_error(
        supply,
        stage="mapping",
        code="no_price_source",
        message="No active row in supply_price_sources and no keyword match.",
    )


def _forecast_for_source(
    series: dict[str, Any],
    *,
    horizon_months: int,
    history_months: int,
) -> dict[str, Any]:
    source_row = series.get("source_row") or {}
    series_id = series.get("fred_series_id")
    series_key = series.get("key")

    if source_row.get("id"):
        history = fetch_from_source(
            source_row, history_months=history_months
        )
    else:
        history = fetch_historical_prices(series_id, history_months=history_months)

    if not history.get("success"):
        return {
            "series_key": series_key,
            "series_id": series_id,
            "label": series.get("label"),
            "source_id": series.get("source_id"),
            "success": False,
            "error": history.get("error", "fetch failed"),
        }

    forecast = forecast_series(
        history["observations"],
        horizon_months=horizon_months,
    )
    if not forecast.get("success"):
        return {
            "series_key": series_key,
            "series_id": series_id,
            "label": series.get("label"),
            "source_id": series.get("source_id"),
            "success": False,
            "error": forecast.get("error", "forecast failed"),
            "history_source": history.get("source"),
            "history_count": history.get("count"),
        }

    scrape_method = history.get("source", "fred_csv")
    return {
        "series_key": series_key,
        "series_id": series_id,
        "label": series.get("label"),
        "unit": series.get("unit", "index"),
        "source_id": series.get("source_id") or history.get("source_id"),
        "source_row": source_row,
        "success": True,
        "history_source": history.get("source"),
        "history_count": history.get("count"),
        "historical_tail": (history.get("observations") or [])[-6:],
        "observations": history.get("observations") or [],
        "scrape_method": scrape_method,
        **forecast,
    }


def material_price_forecast(
    user_id: str,
    project_id: str,
    run_id: str | None = None,
    horizon_months: int = 6,
    material_queries: list[str] | None = None,
    history_months: int = 36,
    access_token: str | None = None,
    *,
    persist: bool = True,
    overrun_threshold_pct: float = 10.0,
    trigger: str = "mcp",
    dry_run: bool = False,
) -> dict[str, Any]:
    """Forecast construction material prices for supplies used in a project budget."""
    if horizon_months < 1 or horizon_months > 24:
        return _error("horizon_months must be between 1 and 24")
    if history_months < 12 or history_months > 120:
        return _error("history_months must be between 12 and 120")
    if trigger not in {"manual", "cron", "mcp"}:
        return _error("trigger must be one of: manual, cron, mcp")

    started = time.monotonic()
    resolved_run_id: str | None = run_id
    persistence_enabled = persist and not dry_run
    persistence_warning: str | None = None

    if persistence_enabled:
        if not store.check_tables_available(access_token):
            persistence_enabled = False
            persistence_warning = (
                "Supply price tables not found. Apply supabase/migrations/"
                "001_supply_price_agent.sql and run scripts/seed_supply_price_sources.py. "
                "Returning ephemeral result only."
            )
            logger.warning(persistence_warning)

    budget = sb.get_project_budget_status(
        user_id, project_id, access_token=access_token
    )
    if not budget.get("success"):
        return budget

    resolved_project_id = budget.get("project_id")
    supplies = _extract_budget_supplies(budget)
    if material_queries:
        supplies = [
            s
            for s in supplies
            if _matches_material_filter(s["supply_name"], material_queries)
        ]
    selected_supplies = [_selected_supply_metadata(supply) for supply in supplies]

    counters: dict[str, Any] = {
        "supplies_requested": len(supplies),
        "supplies_processed": 0,
        "sources_attempted": 0,
        "sources_succeeded": 0,
        "observations_written": 0,
        "forecasts_written": 0,
        "alerts_created": 0,
        "errors": 0,
    }
    supply_errors: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    if persistence_enabled and resolved_project_id:
        run_row = store.create_run(
            run_id=resolved_run_id,
            project_id=resolved_project_id,
            triggered_by=user_id,
            trigger=trigger,
            horizon_months=horizon_months,
            history_months=history_months,
            overrun_threshold_pct=overrun_threshold_pct,
            options={"dry_run": dry_run, "region": "US"},
            selected_supplies=selected_supplies,
            access_token=access_token,
        )
        resolved_run_id = run_row["id"]
        counters = run_row["counters"]

    if not supplies:
        counters["supplies_requested"] = 0
        empty_budget = {
            "total_budget_subtotal": 0.0,
            "projected_subtotal": 0.0,
            "estimated_indexed_delta": 0.0,
            "estimated_indexed_delta_pct": 0.0,
            "overrun_triggered": False,
        }
        if persistence_enabled and resolved_run_id:
            store.finalize_run(
                resolved_run_id,
                started_monotonic=started,
                counters=counters,
                budget_summary=empty_budget,
                error_count=0,
                access_token=access_token,
            )
        return _ok(
            run_id=resolved_run_id,
            project_id=resolved_project_id,
            snapshot=budget.get("snapshot"),
            horizon_months=horizon_months,
            history_months=history_months,
            material_count=0,
            materials=[],
            supplies=[],
            unmapped_supplies=[],
            series_forecasts=[],
            supply_errors=[],
            alerts=[],
            budget_impact=empty_budget,
            run={
                "id": resolved_run_id,
                "status": "completed",
                "counters": counters,
                "budget_summary": empty_budget,
            },
            persistence={"enabled": persistence_enabled, "warning": persistence_warning},
            message=(
                "No budget supplies found"
                + (" for the given material_queries." if material_queries else ".")
            ),
            disclaimer=(
                "Forecasts use US PPI indices as market proxies (FRED). "
                "They are relative index trends, not local currency quotes."
            ),
        )

    counters["supplies_requested"] = len(supplies)

    supply_ids = [str(s["supply_id"]) for s in supplies if s.get("supply_id")]
    sources_by_supply: dict[str, list[dict[str, Any]]] = {}
    if supply_ids:
        try:
            sources_by_supply = store.load_sources_for_supplies(
                supply_ids, access_token=access_token
            )
        except Exception as exc:
            logger.warning("Could not load supply_price_sources: %s", exc)

    unmapped: list[dict[str, Any]] = []
    material_rows: list[dict[str, Any]] = []
    series_cache: dict[str, dict[str, Any]] = {}
    supply_results: list[dict[str, Any]] = []
    source_mappings: list[dict[str, Any]] = []

    for supply in supplies:
        series, map_error = _resolve_source_for_supply(supply, sources_by_supply)
        if map_error:
            unmapped.append(supply)
            supply_errors.append(map_error)
            counters["errors"] += 1
            source_mappings.append(
                {
                    "supply_id": supply.get("supply_id"),
                    "supply_name": supply.get("supply_name"),
                    "mapping_strategy": "unmapped",
                    "source_id": None,
                    "source_name": None,
                    "source_url": None,
                    "series_key": None,
                    "series_id": None,
                    "error_code": map_error.get("code"),
                    "error_message": map_error.get("message"),
                }
            )
            supply_results.append(
                {
                    **supply,
                    "status": "error",
                    "errors": [map_error],
                    "observations": [],
                    "points": [],
                }
            )
            continue

        assert series is not None
        cache_key = series.get("source_id") or series.get("key")
        source_row = series.get("source_row") or {}
        source_mappings.append(
            {
                "supply_id": supply.get("supply_id"),
                "supply_name": supply.get("supply_name"),
                "mapping_strategy": "configured_source" if source_row.get("id") else "keyword_fallback",
                "source_id": series.get("source_id"),
                "source_name": source_row.get("source_name") or series.get("label"),
                "source_url": source_row.get("source_url"),
                "series_key": series.get("key"),
                "series_id": series.get("fred_series_id"),
                "error_code": None,
                "error_message": None,
            }
        )
        material_rows.append({**supply, "series_key": series["key"], "series": series})

        if cache_key not in series_cache:
            counters["sources_attempted"] += 1
            result = _forecast_for_source(
                series,
                horizon_months=horizon_months,
                history_months=history_months,
            )
            series_cache[cache_key] = result
            if result.get("success"):
                counters["sources_succeeded"] += 1
            else:
                counters["errors"] += 1
                supply_errors.append(
                    _supply_error(
                        supply,
                        stage="scraping",
                        code="source_fetch_failed",
                        message=str(result.get("error", "fetch failed")),
                        source_id=series.get("source_id"),
                        retriable=True,
                    )
                )

        forecast = series_cache[cache_key]
        supply_entry: dict[str, Any] = {
            **supply,
            "status": "ok" if forecast.get("success") else "error",
            "errors": [],
            "observations": [],
            "points": [],
        }

        if not forecast.get("success"):
            supply_results.append(supply_entry)
            continue

        counters["supplies_processed"] += 1
        obs_written: list[dict[str, Any]] = []
        if (
            persistence_enabled
            and resolved_run_id
            and resolved_project_id
            and supply.get("supply_id")
            and forecast.get("source_id")
            and forecast.get("observations")
        ):
            try:
                obs_written = store.insert_observations(
                    project_id=str(resolved_project_id),
                    supply_id=str(supply["supply_id"]),
                    source_id=str(forecast["source_id"]),
                    observations=forecast["observations"],
                    scrape_method=str(forecast.get("scrape_method", "fred_csv")),
                    access_token=access_token,
                )
                counters["observations_written"] += len(obs_written)
            except Exception as exc:
                logger.exception("Observation persist failed")
                err = _supply_error(
                    supply,
                    stage="scraping",
                    code="observation_persist_failed",
                    message=str(exc),
                    source_id=forecast.get("source_id"),
                )
                supply_errors.append(err)
                supply_entry["errors"].append(err)
                counters["errors"] += 1

        forecast_rows: list[dict[str, Any]] = []
        if persistence_enabled and resolved_run_id and supply.get("supply_id"):
            try:
                forecast_rows = store.insert_forecasts(
                    run_id=resolved_run_id,
                    project_id=str(resolved_project_id),
                    supply_id=str(supply["supply_id"]),
                    forecast_result=forecast,
                    budget_unit_price=float(supply.get("precio_unitario_budget") or 0)
                    or None,
                    access_token=access_token,
                )
                counters["forecasts_written"] += len(forecast_rows)
            except Exception as exc:
                logger.exception("Forecast persist failed")
                err = _supply_error(
                    supply,
                    stage="forecasting",
                    code="forecast_persist_failed",
                    message=str(exc),
                )
                supply_errors.append(err)
                supply_entry["errors"].append(err)
                counters["errors"] += 1

        tail = forecast.get("historical_tail") or []
        supply_entry["observations"] = [
            {
                "observed_at": o.get("observed_at") or o.get("date"),
                "unit_price": o.get("unit_price") or o.get("value"),
                "source_id": o.get("source_id") or forecast.get("source_id"),
                "scrape_method": (o.get("raw_payload") or {}).get("scrape_method")
                or forecast.get("scrape_method"),
            }
            for o in (obs_written or tail)
        ]
        supply_entry["latest_observation"] = forecast.get("last_observation")
        supply_entry["points"] = [
            {
                "forecast_date": p.get("date"),
                "predicted_unit_price": p.get("value"),
                "unit_price_index": p.get("value"),
                "unit_price_index_lower": p.get("lower"),
                "unit_price_index_upper": p.get("upper"),
                "sequence": idx,
            }
            for idx, p in enumerate(forecast.get("forecast") or [], start=1)
        ]
        if forecast_rows:
            supply_entry["points"] = [
                {
                    "id": row.get("id"),
                    "forecast_date": row.get("forecast_date"),
                    "predicted_unit_price": row.get("predicted_unit_price"),
                    "unit_price_index": (row.get("metadata") or {}).get(
                        "unit_price_index"
                    ),
                    "unit_price_index_lower": (row.get("metadata") or {}).get(
                        "unit_price_index_lower"
                    ),
                    "unit_price_index_upper": (row.get("metadata") or {}).get(
                        "unit_price_index_upper"
                    ),
                    "sequence": (row.get("metadata") or {}).get("sequence"),
                }
                for row in forecast_rows
            ]

        supply_results.append(supply_entry)

    series_forecasts = list(series_cache.values())
    forecast_by_key = {
        r["series_key"]: r for r in series_forecasts if r.get("success")
    }

    total_subtotal = 0.0
    total_delta = 0.0
    enriched_materials: list[dict[str, Any]] = []
    top_drivers: list[dict[str, Any]] = []

    for row in material_rows:
        subtotal = float(row.get("subtotal_budget") or 0)
        total_subtotal += subtotal
        forecast = forecast_by_key.get(row["series_key"])
        entry = {**row}
        entry.pop("series", None)

        if forecast:
            pct = float(forecast.get("forecast_pct_change") or 0)
            delta = round(subtotal * (pct / 100), 2)
            entry["forecast_pct_change"] = pct
            entry["estimated_budget_delta"] = delta
            entry["market_series"] = forecast.get("label")
            entry["last_market_index"] = forecast.get("last_observation")
            entry["forecast_end"] = (forecast.get("forecast") or [])[-1:]
            total_delta += delta
            if delta > 0:
                top_drivers.append(
                    {
                        "supply_id": row.get("supply_id"),
                        "supply_name": row.get("supply_name"),
                        "delta_amount": delta,
                        "forecast_pct_change": pct,
                    }
                )
        else:
            entry["forecast_pct_change"] = None
            entry["estimated_budget_delta"] = None

        enriched_materials.append(entry)

    top_drivers.sort(key=lambda item: item["delta_amount"], reverse=True)
    delta_pct = round((total_delta / total_subtotal) * 100, 2) if total_subtotal else 0.0
    projected_subtotal = round(total_subtotal + total_delta, 2)
    overrun_triggered = total_delta > 0 and delta_pct > overrun_threshold_pct

    budget_impact = {
        "total_budget_subtotal": round(total_subtotal, 2),
        "projected_subtotal": projected_subtotal,
        "estimated_indexed_delta": round(total_delta, 2),
        "estimated_indexed_delta_pct": delta_pct,
        "overrun_triggered": overrun_triggered,
        "note": (
            "Delta applies indexed % change to budget subtotals for mapped "
            "supplies only; unmapped supplies are excluded."
        ),
    }

    if persistence_enabled and resolved_run_id and overrun_triggered and resolved_project_id:
        try:
            alert = store.create_overrun_alert(
                run_id=resolved_run_id,
                project_id=str(resolved_project_id),
                threshold_pct=overrun_threshold_pct,
                budget_subtotal=total_subtotal,
                projected_subtotal=projected_subtotal,
                delta_amount=total_delta,
                delta_pct=delta_pct,
                top_drivers=top_drivers[:5],
                access_token=access_token,
            )
            alerts.append(alert)
            counters["alerts_created"] += 1
        except Exception as exc:
            logger.exception("Alert persist failed")
            counters["errors"] += 1

    run_status = "completed"
    if persistence_enabled and resolved_run_id:
        run_status = store.finalize_run(
            resolved_run_id,
            started_monotonic=started,
            counters=counters,
            budget_summary=budget_impact,
            error_count=int(counters["errors"]),
            error_summary=(
                f"{counters['errors']} supply error(s)" if counters["errors"] else None
            ),
            source_mappings=source_mappings,
            access_token=access_token,
        )

    return _ok(
        run_id=resolved_run_id,
        project_id=resolved_project_id,
        snapshot=budget.get("snapshot"),
        horizon_months=horizon_months,
        history_months=history_months,
        material_count=len(enriched_materials),
        materials=enriched_materials,
        supplies=supply_results,
        unmapped_supplies=unmapped,
        series_forecasts=series_forecasts,
        supply_errors=supply_errors,
        alerts=alerts,
        budget_impact=budget_impact,
        run={
            "id": resolved_run_id,
            "status": run_status,
            "counters": counters,
            "budget_summary": budget_impact,
            "duration_ms": int((time.monotonic() - started) * 1000),
        },
        persistence={
            "enabled": persistence_enabled,
            "dry_run": dry_run,
            "warning": persistence_warning,
        },
        disclaimer=(
            "Forecasts use US PPI indices from FRED as market proxies. "
            "Values are index trends, not local currency unit prices. "
            "Set FRED_API_KEY for higher-rate API access; CSV fallback is used otherwise."
        ),
    )
