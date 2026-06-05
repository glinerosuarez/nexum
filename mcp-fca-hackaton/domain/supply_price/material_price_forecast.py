"""Material price forecast tool: project supplies + market data + budget impact."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from domain.observability.arize_tracing import (
    current_trace_id,
    force_flush,
    mark_span_error,
    mark_span_ok,
    set_span_attributes,
    start_as_current_span,
    tracing_enabled,
    tracing_status,
)
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
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
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
        "input_batch_id": supply.get("input_batch_id"),
        "normalized_supply_id": supply.get("normalized_supply_id"),
        "extracted_row_ids": supply.get("extracted_row_ids") or [],
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


def _extract_persisted_selection_supplies(selection_inputs: dict[str, Any]) -> list[dict[str, Any]]:
    batch = selection_inputs.get("batch") or {}
    input_batch_id = batch.get("id")
    normalized_supplies = selection_inputs.get("normalized_supplies") or []
    supplies: list[dict[str, Any]] = []
    for normalized_supply in normalized_supplies:
        supply_name = str(
            normalized_supply.get("display_name")
            or normalized_supply.get("normalized_name")
            or ""
        ).strip()
        if not supply_name:
            continue

        quantity_total = normalized_supply.get("quantity_total")
        unit_price = normalized_supply.get("unit_price_reference")
        subtotal = normalized_supply.get("total_price_reference")
        if subtotal is None and quantity_total is not None and unit_price is not None:
            try:
                subtotal = float(quantity_total) * float(unit_price)
            except Exception:
                subtotal = None

        supplies.append(
            {
                "supply_id": None,
                "supply_name": supply_name,
                "unidad_medida": normalized_supply.get("normalized_unit"),
                "cantidad_planeada": quantity_total,
                "precio_unitario_budget": unit_price,
                "subtotal_budget": subtotal,
                "input_batch_id": input_batch_id,
                "normalized_supply_id": normalized_supply.get("id"),
                "extracted_row_ids": normalized_supply.get("extracted_row_ids") or [],
            }
        )
    return supplies


def _material_price_forecast_impl(
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
    trace_id: str | None = None,
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
    selection_inputs = sb.get_project_supply_selection_inputs(
        user_id,
        project_id,
        access_token=access_token,
    )
    selection_batch = selection_inputs.get("batch") if selection_inputs.get("success") else None
    selection_documents = selection_inputs.get("documents") if selection_inputs.get("success") else []
    selection_normalized_supplies = (
        selection_inputs.get("normalized_supplies") if selection_inputs.get("success") else []
    )
    persisted_supplies = (
        _extract_persisted_selection_supplies(selection_inputs)
        if selection_inputs.get("success")
        else []
    )
    supplies = persisted_supplies or _extract_budget_supplies(budget)
    selection_source = (
        "persisted_normalized_inputs" if persisted_supplies else "budget_snapshot_items"
    )
    selection_diagnostics = {
        "input_batch_id": selection_batch.get("id") if isinstance(selection_batch, dict) else None,
        "input_batch_status": selection_batch.get("status") if isinstance(selection_batch, dict) else None,
        "document_count": len(selection_documents or []),
        "extracted_row_count": int(
            sum(int(doc.get("extracted_row_count") or 0) for doc in (selection_documents or []))
        ),
        "normalized_supply_count": len(selection_normalized_supplies or []),
        "persisted_supply_count": len(persisted_supplies),
        "parse_failed_document_count": sum(
            1 for doc in (selection_documents or []) if doc.get("parse_status") == "parse_failed"
        ),
        "metadata_only_document_count": sum(
            1 for doc in (selection_documents or []) if doc.get("parse_status") == "metadata_only"
        ),
        "unsupported_document_count": sum(
            1
            for doc in (selection_documents or [])
            if doc.get("parse_status") == "unsupported_for_supply_rows"
        ),
        "row_emitting_document_count": sum(
            1 for doc in (selection_documents or []) if int(doc.get("extracted_row_count") or 0) > 0
        ),
    }
    selection_diagnostics["qualified_supply_count"] = selection_diagnostics["normalized_supply_count"]
    selection_diagnostics["rejected_candidate_count"] = max(
        selection_diagnostics["extracted_row_count"] - selection_diagnostics["qualified_supply_count"],
        0,
    )
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
            options={"dry_run": dry_run, "region": "US", "trace_id": trace_id},
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
                "selection_source": selection_source,
            },
            persistence={"enabled": persistence_enabled, "warning": persistence_warning},
            selection_source=selection_source,
            selection_diagnostics=selection_diagnostics,
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
                    "input_batch_id": supply.get("input_batch_id"),
                    "normalized_supply_id": supply.get("normalized_supply_id"),
                    "extracted_row_ids": supply.get("extracted_row_ids") or [],
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
                    "input_batch_id": supply.get("input_batch_id"),
                    "normalized_supply_id": supply.get("normalized_supply_id"),
                    "extracted_row_ids": supply.get("extracted_row_ids") or [],
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
            "selection_source": selection_source,
        },
        persistence={
            "enabled": persistence_enabled,
            "dry_run": dry_run,
            "warning": persistence_warning,
        },
        selection_source=selection_source,
        selection_diagnostics=selection_diagnostics,
        disclaimer=(
            "Forecasts use US PPI indices from FRED as market proxies. "
            "Values are index trends, not local currency unit prices. "
            "Set FRED_API_KEY for higher-rate API access; CSV fallback is used otherwise."
        ),
    )


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
    final_result: dict[str, Any] | None = None
    with start_as_current_span(
        "material_price_forecast",
        kind="CHAIN",
        attributes={
            "project.id": project_id,
            "user.id": user_id,
            "run.id": run_id or "",
            "pipeline.variant": "deterministic",
            "pipeline.name": "supply_intelligence",
            "forecast.horizon_months": horizon_months,
            "forecast.history_months": history_months,
            "run.trigger": trigger,
            "run.dry_run": dry_run,
            "run.persist_requested": persist,
            "material_queries.count": len(material_queries or []),
        },
    ) as root_span:
        trace_id = current_trace_id(root_span)
        try:
            result = _material_price_forecast_impl(
                user_id=user_id,
                project_id=project_id,
                run_id=run_id,
                horizon_months=horizon_months,
                material_queries=material_queries,
                history_months=history_months,
                access_token=access_token,
                persist=persist,
                overrun_threshold_pct=overrun_threshold_pct,
                trigger=trigger,
                dry_run=dry_run,
                trace_id=trace_id,
            )
        except Exception as exc:
            mark_span_error(root_span, exc)
            raise

        if isinstance(result, dict):
            result["observability"] = {
                "arize_tracing_enabled": tracing_enabled(),
                "arize_status": tracing_status(),
                "trace_id": trace_id,
            }

        if not isinstance(result, dict) or not result.get("success"):
            set_span_attributes(
                root_span,
                {
                    "run.success": False,
                    "run.error": result.get("error") if isinstance(result, dict) else "unknown",
                },
            )
            mark_span_ok(root_span)
            final_result = result
        else:
            run_payload = result.get("run") if isinstance(result.get("run"), dict) else {}
            counters = run_payload.get("counters") if isinstance(run_payload.get("counters"), dict) else {}
            supplies = result.get("supplies") if isinstance(result.get("supplies"), list) else []
            materials = result.get("materials") if isinstance(result.get("materials"), list) else []
            unmapped = result.get("unmapped_supplies") if isinstance(result.get("unmapped_supplies"), list) else []
            alerts = result.get("alerts") if isinstance(result.get("alerts"), list) else []
            budget_impact = result.get("budget_impact") if isinstance(result.get("budget_impact"), dict) else {}
            selection_diagnostics = (
                result.get("selection_diagnostics")
                if isinstance(result.get("selection_diagnostics"), dict)
                else {}
            )

            mapped_subtotal_budget = round(
                sum(float(item.get("subtotal_budget") or 0) for item in materials),
                2,
            )
            unmapped_subtotal_budget = round(
                sum(float(item.get("subtotal_budget") or 0) for item in unmapped),
                2,
            )
            series_keys_used = sorted(
                {
                    str(item.get("series_key"))
                    for item in materials
                    if item.get("series_key")
                }
            )
            extracted_row_count = int(selection_diagnostics.get("extracted_row_count", 0) or 0)
            normalized_supply_count = int(
                selection_diagnostics.get("normalized_supply_count", 0) or 0
            )
            qualified_supply_count = int(
                selection_diagnostics.get("qualified_supply_count", 0) or 0
            )
            rejected_candidate_count = int(
                selection_diagnostics.get("rejected_candidate_count", 0) or 0
            )

            with start_as_current_span(
                "document_ingest",
                kind="CHAIN",
                attributes={
                    "selection.input_batch_id": selection_diagnostics.get("input_batch_id") or "",
                    "selection.input_batch_status": selection_diagnostics.get("input_batch_status") or "",
                    "selection.document_count": selection_diagnostics.get("document_count", 0),
                    "selection.row_emitting_document_count": selection_diagnostics.get(
                        "row_emitting_document_count",
                        0,
                    ),
                    "selection.parse_failed_document_count": selection_diagnostics.get(
                        "parse_failed_document_count",
                        0,
                    ),
                    "selection.metadata_only_document_count": selection_diagnostics.get(
                        "metadata_only_document_count",
                        0,
                    ),
                    "selection.unsupported_document_count": selection_diagnostics.get(
                        "unsupported_document_count",
                        0,
                    ),
                },
            ) as document_ingest_span:
                mark_span_ok(document_ingest_span)

            with start_as_current_span(
                "row_extraction",
                kind="CHAIN",
                attributes={
                    "selection.extracted_row_count": extracted_row_count,
                    "selection.row_emitting_document_count": selection_diagnostics.get(
                        "row_emitting_document_count",
                        0,
                    ),
                    "selection.rows_per_row_emitting_document": (
                        round(
                            extracted_row_count
                            / max(
                                int(selection_diagnostics.get("row_emitting_document_count", 0)),
                                1,
                            ),
                            2,
                        )
                        if selection_diagnostics.get("row_emitting_document_count")
                        else 0.0
                    ),
                },
            ) as row_extraction_span:
                mark_span_ok(row_extraction_span)

            with start_as_current_span(
                "supply_qualification",
                kind="CHAIN",
                attributes={
                    "selection.extracted_row_count": extracted_row_count,
                    "selection.qualified_supply_count": qualified_supply_count,
                    "selection.rejected_candidate_count": rejected_candidate_count,
                    "selection.qualification_ratio": (
                        round(qualified_supply_count / extracted_row_count, 4)
                        if extracted_row_count
                        else 0.0
                    ),
                    "selection.rejection_ratio": (
                        round(rejected_candidate_count / extracted_row_count, 4)
                        if extracted_row_count
                        else 0.0
                    ),
                },
            ) as qualification_span:
                mark_span_ok(qualification_span)

            with start_as_current_span(
                "normalization",
                kind="CHAIN",
                attributes={
                    "selection.normalized_supply_count": normalized_supply_count,
                    "selection.qualified_supply_count": qualified_supply_count,
                    "selection.normalization_ratio": (
                        round(normalized_supply_count / qualified_supply_count, 4)
                        if qualified_supply_count
                        else 0.0
                    ),
                    "selection.dedupe_savings_count": max(
                        qualified_supply_count - normalized_supply_count,
                        0,
                    ),
                },
            ) as normalization_span:
                mark_span_ok(normalization_span)

            with start_as_current_span(
                "critical_supply_selection",
                kind="CHAIN",
                attributes={
                    "selection.source": run_payload.get("selection_source") or result.get("selection_source"),
                    "selection.selected_supply_count": counters.get("supplies_requested", len(supplies)),
                    "selection.material_queries_count": len(material_queries or []),
                    "selection.input_batch_id": selection_diagnostics.get("input_batch_id") or "",
                    "selection.input_batch_status": selection_diagnostics.get("input_batch_status") or "",
                    "selection.document_count": selection_diagnostics.get("document_count", 0),
                    "selection.extracted_row_count": selection_diagnostics.get("extracted_row_count", 0),
                    "selection.normalized_supply_count": selection_diagnostics.get("normalized_supply_count", 0),
                    "selection.persisted_supply_count": selection_diagnostics.get("persisted_supply_count", 0),
                    "selection.qualified_supply_count": selection_diagnostics.get("qualified_supply_count", 0),
                    "selection.rejected_candidate_count": selection_diagnostics.get("rejected_candidate_count", 0),
                },
            ) as selection_span:
                mark_span_ok(selection_span)

            with start_as_current_span(
                "market_mapping",
                kind="CHAIN",
                attributes={
                    "mapping.mapped_supply_count": len(materials),
                    "mapping.unmapped_supply_count": len(unmapped),
                    "mapping.mapped_subtotal_budget": mapped_subtotal_budget,
                    "mapping.unmapped_subtotal_budget": unmapped_subtotal_budget,
                    "mapping.series_keys_used": series_keys_used,
                    "mapping.coverage_ratio": round((len(materials) / len(supplies)), 4) if supplies else 0.0,
                    "mapping.normalized_supply_coverage_ratio": (
                        round(
                            len(materials)
                            / max(int(selection_diagnostics.get("normalized_supply_count", 0)), 1),
                            4,
                        )
                        if selection_diagnostics.get("normalized_supply_count")
                        else 0.0
                    ),
                },
            ) as mapping_span:
                mark_span_ok(mapping_span)

            with start_as_current_span(
                "forecast_and_risk",
                kind="CHAIN",
                attributes={
                    "forecast.supplies_processed": counters.get("supplies_processed", 0),
                    "forecast.forecasts_written": counters.get("forecasts_written", 0),
                    "forecast.alerts_created": counters.get("alerts_created", 0),
                    "forecast.error_count": counters.get("errors", 0),
                    "budget.total_subtotal": budget_impact.get("total_budget_subtotal", 0),
                    "budget.projected_subtotal": budget_impact.get("projected_subtotal", 0),
                    "budget.delta_pct": budget_impact.get("estimated_indexed_delta_pct", 0),
                    "budget.overrun_triggered": budget_impact.get("overrun_triggered", False),
                    "alerts.count": len(alerts),
                },
            ) as forecast_span:
                mark_span_ok(forecast_span)

            set_span_attributes(
                root_span,
                {
                    "run.success": True,
                    "run.id": run_payload.get("id") or run_id or "",
                    "run.status": run_payload.get("status") or "",
                    "selection.source": run_payload.get("selection_source") or result.get("selection_source"),
                    "selection.selected_supply_count": counters.get("supplies_requested", len(supplies)),
                    "selection.input_batch_id": selection_diagnostics.get("input_batch_id") or "",
                    "selection.document_count": selection_diagnostics.get("document_count", 0),
                    "selection.extracted_row_count": selection_diagnostics.get("extracted_row_count", 0),
                    "selection.normalized_supply_count": selection_diagnostics.get("normalized_supply_count", 0),
                    "selection.qualified_supply_count": selection_diagnostics.get("qualified_supply_count", 0),
                    "selection.rejected_candidate_count": selection_diagnostics.get("rejected_candidate_count", 0),
                    "mapping.mapped_supply_count": len(materials),
                    "mapping.unmapped_supply_count": len(unmapped),
                    "mapping.coverage_ratio": round((len(materials) / len(supplies)), 4) if supplies else 0.0,
                    "run.supplies_processed": counters.get("supplies_processed", 0),
                    "run.error_count": counters.get("errors", 0),
                    "run.forecasts_written": counters.get("forecasts_written", 0),
                    "run.alerts_created": counters.get("alerts_created", 0),
                },
            )
            mark_span_ok(root_span)
            final_result = result

    force_flush()
    return final_result if final_result is not None else _error("material_price_forecast returned no result")
