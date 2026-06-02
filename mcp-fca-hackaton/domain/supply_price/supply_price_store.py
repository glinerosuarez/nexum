"""Persistence layer for supply price agent tables on Cloud SQL."""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from infra.postgres_client import PostgresConfigError, get_conn, json_dumps

logger = logging.getLogger("mcp-supply-price-store")


class SupplyPriceStoreError(RuntimeError):
    """Raised when supply price tables are unavailable or writes fail."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_json(value: Any) -> Any:
    if isinstance(value, str):
        return value
    return json_dumps(_json_safe(value))


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _normalize_rows(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return rows or []


def _build_terminal_lifecycle(
    metadata: dict[str, Any],
    *,
    status: str,
    finished_at: str,
) -> dict[str, Any]:
    lifecycle = metadata.get("lifecycle") if isinstance(metadata.get("lifecycle"), dict) else {}
    history = lifecycle.get("history") if isinstance(lifecycle.get("history"), list) else []

    stage_order = [
        "accepted",
        "selecting_targets",
        "fetching_market_data",
        "forecasting",
        "computing_risk",
        "persisting",
    ]
    if status == "completed":
        stage_order.append("completed")
    else:
        stage_order.append("failed")

    seen = {
        entry.get("stage")
        for entry in history
        if isinstance(entry, dict) and isinstance(entry.get("stage"), str)
    }
    updated_history = list(history)
    for stage in stage_order:
        if stage in seen:
            continue
        updated_history.append(
            {
                "stage": stage,
                "status": "completed" if stage == "completed" else status if stage == "failed" else "running",
                "at": finished_at,
            }
        )

    return {
        "stage": "completed" if status == "completed" else "failed",
        "status": status,
        "updated_at": finished_at,
        "history": updated_history,
    }


def _is_missing_table_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "does not exist" in text
        or "undefinedtable" in text
        or "relation" in text
    )


def create_run(
    *,
    run_id: str | None = None,
    project_id: str,
    triggered_by: str | None,
    trigger: str,
    horizon_months: int,
    history_months: int,
    overrun_threshold_pct: float,
    options: dict[str, Any] | None = None,
    selected_supplies: list[dict[str, Any]] | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    del access_token
    resolved_run_id = run_id or str(uuid.uuid4())
    counters = {
        "supplies_requested": 0,
        "supplies_processed": 0,
        "sources_attempted": 0,
        "sources_succeeded": 0,
        "observations_written": 0,
        "forecasts_written": 0,
        "alerts_created": 0,
        "errors": 0,
    }
    metadata = {
        "triggered_by": triggered_by,
        "trigger": trigger,
        "horizon_months": horizon_months,
        "history_months": history_months,
        "overrun_threshold_pct": overrun_threshold_pct,
        "options": options or {},
        "counters": counters,
        "selected_supplies": selected_supplies or [],
    }

    with get_conn() as conn:
        with conn.cursor() as cur:
            if run_id:
                cur.execute(
                    """
                    select id, metadata
                    from supply_agent_runs
                    where id = %s
                    limit 1
                    """,
                    (run_id,),
                )
                existing = cur.fetchone()
                if existing:
                    existing_metadata = existing.get("metadata") or {}
                    existing_counters = (
                        existing_metadata.get("counters")
                        if isinstance(existing_metadata, dict)
                        else {}
                    )
                    merged_counters = {**counters}
                    if isinstance(existing_counters, dict):
                        merged_counters.update(
                            {
                                key: int(value)
                                for key, value in existing_counters.items()
                                if isinstance(value, (int, float))
                            },
                        )
                    merged_metadata = (
                        {**existing_metadata, **metadata}
                        if isinstance(existing_metadata, dict)
                        else metadata
                    )
                    merged_metadata["counters"] = merged_counters
                    cur.execute(
                        """
                        update supply_agent_runs
                        set metadata = %s::jsonb, updated_at = %s
                        where id = %s
                        """,
                        (_coerce_json(merged_metadata), _utc_now_iso(), run_id),
                    )
                    row_started_at = existing_metadata.get("started_at") if isinstance(existing_metadata, dict) else None
                    conn.commit()
                    return {
                        "id": run_id,
                        "project_id": project_id,
                        "status": "running",
                        "started_at": row_started_at or _utc_now_iso(),
                        "metadata": merged_metadata,
                        "counters": merged_counters,
                    }

            started_at = _utc_now_iso()
            cur.execute(
                """
                insert into supply_agent_runs (
                  id, project_id, status, started_at, metadata
                )
                values (%s, %s, %s, %s, %s::jsonb)
                returning id, project_id, status, started_at, metadata
                """,
                (
                    resolved_run_id,
                    project_id,
                    "running",
                    started_at,
                    _coerce_json(metadata),
                ),
            )
            row = cur.fetchone() or {}
        conn.commit()
    return {**row, "counters": counters}


def finalize_run(
    run_id: str,
    *,
    started_monotonic: float,
    counters: dict[str, Any],
    budget_summary: dict[str, Any],
    error_count: int,
    error_summary: str | None = None,
    source_mappings: list[dict[str, Any]] | None = None,
    access_token: str | None = None,
) -> str:
    del access_token
    status = "completed"
    if error_count > 0 and counters.get("supplies_processed", 0) == 0:
        status = "failed"
    duration_ms = int((time.monotonic() - started_monotonic) * 1000)
    finished_at = _utc_now_iso()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select metadata
                from supply_agent_runs
                where id = %s
                limit 1
                """,
                (run_id,),
            )
            existing = cur.fetchone() or {}
            metadata = existing.get("metadata") or {}
            metadata["counters"] = counters
            metadata["budget_summary"] = budget_summary
            metadata["duration_ms"] = duration_ms
            if source_mappings is not None:
                metadata["source_mappings"] = source_mappings
            metadata["lifecycle"] = _build_terminal_lifecycle(
                metadata,
                status=status,
                finished_at=finished_at,
            )
            metadata["stage"] = metadata["lifecycle"]["stage"]
            cur.execute(
                """
                update supply_agent_runs
                set
                  status = %s,
                  finished_at = %s,
                  error_summary = %s,
                  metadata = %s::jsonb,
                  updated_at = %s
                where id = %s
                """,
                (
                    status,
                    finished_at,
                    error_summary,
                    _coerce_json(metadata),
                    finished_at,
                    run_id,
                ),
            )
        conn.commit()
    return status


def load_sources_for_supplies(
    supply_ids: list[str],
    access_token: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    del access_token
    if not supply_ids:
        return {}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select *
                from supply_price_sources
                where supply_id = any(%s)
                  and is_active = true
                order by priority asc
                """,
                (supply_ids,),
            )
            rows = _normalize_rows(cur.fetchall())
        conn.commit()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["supply_id"]), []).append(row)
    return grouped


def insert_observations(
    *,
    project_id: str,
    supply_id: str,
    source_id: str,
    observations: list[dict[str, Any]],
    scrape_method: str,
    currency: str = "USD",
    access_token: str | None = None,
) -> list[dict[str, Any]]:
    del access_token
    if not observations:
        return []

    fetched_at = _utc_now_iso()
    inserted: list[dict[str, Any]] = []
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select observed_at
                from supply_price_observations
                where source_id = %s
                """,
                (source_id,),
            )
            existing_dates = {str(row["observed_at"]) for row in _normalize_rows(cur.fetchall())}

            for obs in observations:
                observed_at = obs["date"][:10]
                if observed_at in existing_dates:
                    continue
                payload = {
                    "scrape_method": scrape_method,
                    "fetched_at": fetched_at,
                    "date": obs["date"],
                    "value": obs["value"],
                }
                cur.execute(
                    """
                    insert into supply_price_observations (
                      project_id, supply_id, source_id, observed_at, unit_price, currency, raw_payload
                    )
                    values (%s, %s, %s, %s, %s, %s, %s::jsonb)
                    returning *
                    """,
                    (
                        project_id,
                        supply_id,
                        source_id,
                        observed_at,
                        obs["value"],
                        currency,
                        _coerce_json(payload),
                    ),
                )
                row = cur.fetchone()
                if row:
                    inserted.append(row)

            cur.execute(
                """
                update supply_price_sources
                set last_success_at = %s, updated_at = %s
                where id = %s
                """,
                (fetched_at, fetched_at, source_id),
            )
        conn.commit()
    return inserted


def insert_forecasts(
    *,
    run_id: str,
    project_id: str,
    supply_id: str,
    forecast_result: dict[str, Any],
    budget_unit_price: float | None,
    access_token: str | None = None,
) -> list[dict[str, Any]]:
    del access_token
    baseline = forecast_result.get("last_observation") or {}
    baseline_date = baseline.get("date")
    baseline_value = baseline.get("value")
    pct_change = forecast_result.get("forecast_pct_change")
    forecast_points = forecast_result.get("forecast") or []
    inserted: list[dict[str, Any]] = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            for idx, point in enumerate(forecast_points, start=1):
                index_value = float(point["value"])
                predicted = index_value
                if budget_unit_price and baseline_value:
                    predicted = round(
                        float(budget_unit_price) * (index_value / float(baseline_value)),
                        6,
                    )
                metadata = {
                    "sequence": idx,
                    "model": forecast_result.get("method", "linear_trend"),
                    "unit_price_index": index_value,
                    "unit_price_index_lower": point.get("lower"),
                    "unit_price_index_upper": point.get("upper"),
                    "baseline_date": baseline_date,
                    "baseline_value": baseline_value,
                    "forecast_pct_change": pct_change if idx == len(forecast_points) else None,
                }
                cur.execute(
                    """
                    insert into supply_cost_forecasts (
                      run_id, project_id, supply_id, forecast_date, predicted_unit_price, model_version, metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s::jsonb)
                    returning *
                    """,
                    (
                        run_id,
                        project_id,
                        supply_id,
                        point["date"][:10],
                        predicted,
                        "1.0",
                        _coerce_json(metadata),
                    ),
                )
                row = cur.fetchone()
                if row:
                    inserted.append(row)
        conn.commit()
    return inserted


def create_overrun_alert(
    *,
    run_id: str,
    project_id: str,
    threshold_pct: float,
    budget_subtotal: float,
    projected_subtotal: float,
    delta_amount: float,
    delta_pct: float,
    top_drivers: list[dict[str, Any]],
    access_token: str | None = None,
) -> dict[str, Any]:
    del access_token
    overrun_amount = max(round(delta_amount, 2), 0)
    overrun_pct = max(round(delta_pct, 4), 0)

    row = {
        "alert_type": "project_budget_overrun",
        "message": (
            f"Projected mapped supply cost exceeds budget by {overrun_pct:.2f}% "
            f"(threshold {threshold_pct:.2f}%)."
        ),
        "decision": {
            "overrun_triggered": True,
            "threshold_pct": threshold_pct,
            "projected_delta_pct": delta_pct,
            "comparison_basis": "mapped_supplies_subtotal",
        },
        "top_drivers": top_drivers,
    }

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into supply_cost_overrun_alerts (
                  run_id, project_id, severity, baseline_budget, projected_total_cost,
                  overrun_amount, overrun_pct, threshold_pct, status, metadata
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                returning *
                """,
                (
                    run_id,
                    project_id,
                    "critical",
                    round(budget_subtotal, 2),
                    round(projected_subtotal, 2),
                    overrun_amount,
                    overrun_pct,
                    threshold_pct,
                    "open",
                    _coerce_json(row),
                ),
            )
            inserted = cur.fetchone() or {}
        conn.commit()
    return inserted


def source_to_series(source: dict[str, Any]) -> dict[str, Any]:
    """Normalize a supply_price_sources row to the in-memory series shape."""
    cfg = source.get("parse_config") or {}
    return {
        "key": cfg.get("series_key") or source.get("source_name"),
        "fred_series_id": cfg.get("series_id"),
        "label": cfg.get("label") or source.get("source_name"),
        "unit": cfg.get("price_unit", "index"),
        "source_id": source.get("id"),
        "source_row": source,
    }


def check_tables_available(access_token: str | None = None) -> bool:
    del access_token
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("select 1 from supply_agent_runs limit 1")
                cur.execute("select 1 from supply_price_sources limit 1")
            conn.commit()
        return True
    except PostgresConfigError:
        raise
    except Exception as exc:
        if _is_missing_table_error(exc):
            return False
        raise SupplyPriceStoreError(str(exc)) from exc
