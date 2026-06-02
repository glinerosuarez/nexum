from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import Principal, resolve_principal
from .db import DbConfigError, get_conn
from .onboarding import create_project_with_bootstrap


app = FastAPI(title="nexum-api", version="0.1.0")
logger = logging.getLogger("nexum-api")


RUN_NON_TERMINAL_STAGES: tuple[str, ...] = (
    "accepted",
    "selecting_targets",
    "fetching_market_data",
    "forecasting",
    "computing_risk",
    "persisting",
)
RUN_TERMINAL_STAGES: tuple[str, ...] = ("completed", "failed")
RUN_ALL_STAGES: tuple[str, ...] = RUN_NON_TERMINAL_STAGES + RUN_TERMINAL_STAGES
RUN_STAGE_INDEX = {stage: index for index, stage in enumerate(RUN_ALL_STAGES)}
TERMINAL_STATUSES = {"completed", "failed"}
RUN_ERROR_CLASSES = {"remote_mcp_failed", "persist_failed", "validation_failed", "authz_failed"}


def _coerce_run_id(value: str | None) -> str:
    if not value:
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(value))
    except Exception:
        return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_number(value: Any, fallback: float = 0.0) -> float:
    try:
        if value is None:
            return fallback
        return float(value)
    except Exception:
        return fallback


def _as_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None:
            return fallback
        return int(value)
    except Exception:
        return fallback


def _mcp_timeout_ms() -> int:
    try:
        raw = int((os.getenv("SUPPLY_AGENT_MCP_TIMEOUT_MS") or "90000").strip())
        return max(5000, min(raw, 300000))
    except Exception:
        return 90000


def _mcp_required() -> bool:
    return (os.getenv("SUPPLY_AGENT_MCP_REQUIRED") or "false").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def _mcp_url() -> str:
    return (os.getenv("SUPPLY_AGENT_MCP_URL") or "").strip()


def _mcp_bearer() -> str | None:
    value = (os.getenv("SUPPLY_AGENT_MCP_BEARER") or "").strip()
    return value or None


def _mcp_protocol_version() -> str:
    return "2025-03-26"


def _default_horizon() -> int:
    return 6


def _default_history() -> int:
    return 36


def _default_overrun_threshold_pct() -> float:
    return 10.0


def _empty_run_counters() -> dict[str, int]:
    return {
        "supplies_requested": 0,
        "supplies_processed": 0,
        "sources_attempted": 0,
        "sources_succeeded": 0,
        "observations_written": 0,
        "forecasts_written": 0,
        "alerts_created": 0,
        "errors": 0,
    }


def _normalize_run_status(status: Any) -> str:
    value = str(status or "").strip().lower()
    if value in TERMINAL_STATUSES:
        return value
    if value in {"running", "accepted", "in_progress", "processing"}:
        return "running"
    if any(token in value for token in ("fail", "error")):
        return "failed"
    if any(token in value for token in ("done", "complete", "success")):
        return "completed"
    return "running"


def _normalize_run_stage(stage: Any, *, status: str) -> str:
    value = str(stage or "").strip().lower()
    if value in RUN_STAGE_INDEX:
        return value
    if status == "completed":
        return "completed"
    if status == "failed":
        return "failed"
    return "fetching_market_data"


def _is_terminal_stage(stage: str) -> bool:
    return stage in RUN_TERMINAL_STAGES


def _is_valid_stage_transition(current_stage: str | None, target_stage: str) -> bool:
    if target_stage not in RUN_STAGE_INDEX:
        return False
    if current_stage is None:
        return True
    if current_stage not in RUN_STAGE_INDEX:
        return False
    if current_stage == target_stage:
        return True
    if _is_terminal_stage(current_stage):
        return False
    if target_stage == "failed":
        return True
    return RUN_STAGE_INDEX[target_stage] > RUN_STAGE_INDEX[current_stage]


def _classify_failure(error_summary: str | None, *, default: str) -> str:
    text = (error_summary or "").lower()
    if "unauthorized" in text or "forbidden" in text or "authz" in text:
        return "authz_failed"
    if any(token in text for token in ("validation", "invalid", "must be", "required", "unprocessable")):
        return "validation_failed"
    if "persist" in text or "database" in text or "sql" in text or "insert" in text:
        return "persist_failed"
    return default


def _normalize_mcp_envelope(remote: dict[str, Any], *, fallback_run_id: str) -> dict[str, Any]:
    run = remote.get("run") if isinstance(remote.get("run"), dict) else {}
    diagnostics = remote.get("diagnostics") if isinstance(remote.get("diagnostics"), dict) else {}
    counters = (
        remote.get("counters")
        if isinstance(remote.get("counters"), dict)
        else run.get("counters")
        if isinstance(run.get("counters"), dict)
        else {}
    )
    normalized_counters = _empty_run_counters()
    normalized_counters.update({k: _as_int(v, normalized_counters.get(k, 0)) for k, v in counters.items()})

    run_id = (
        remote.get("run_id")
        if isinstance(remote.get("run_id"), str)
        else run.get("id")
        if isinstance(run.get("id"), str)
        else fallback_run_id
    )

    success = remote.get("success")
    status_raw = remote.get("status") or run.get("status")
    if status_raw is None:
        if success is False:
            status = "failed"
        elif success is True:
            status = "completed"
        else:
            status = "running"
    else:
        status = _normalize_run_status(status_raw)

    stage_raw = remote.get("stage") or run.get("stage")
    stage = _normalize_run_stage(stage_raw, status=status)

    error_summary = (
        diagnostics.get("error_summary")
        if isinstance(diagnostics.get("error_summary"), str)
        else remote.get("error")
        if isinstance(remote.get("error"), str)
        else None
    )
    error_class = (
        diagnostics.get("error_class")
        if isinstance(diagnostics.get("error_class"), str)
        else remote.get("error_class")
        if isinstance(remote.get("error_class"), str)
        else None
    )
    if status == "failed":
        if not error_summary:
            error_summary = "MCP tool execution failed."
        if not error_class:
            error_class = _classify_failure(error_summary, default="remote_mcp_failed")

    normalized_diagnostics = {
        "error_class": error_class,
        "error_summary": error_summary,
        "remote_status_raw": status_raw,
        "remote_stage_raw": stage_raw,
    }
    if run_id != fallback_run_id:
        normalized_diagnostics["remote_run_id"] = run_id

    return {
        "run_id": fallback_run_id,
        "status": status,
        "stage": stage,
        "counters": normalized_counters,
        "diagnostics": normalized_diagnostics,
    }


def _log_run_event(
    event: str,
    *,
    run_id: str,
    project_id: str,
    profile_id: str,
    stage: str,
    status: str,
    error_class: str | None = None,
    duration_ms: int | None = None,
) -> None:
    payload = {
        "event": event,
        "run_id": run_id,
        "project_id": project_id,
        "profile_id": profile_id,
        "stage": stage,
        "status": status,
        "error_class": error_class,
        "duration_ms": duration_ms,
        "at": _now_iso(),
    }
    logger.info(json.dumps(payload, sort_keys=True))


def _failure_status_code(error_class: str) -> int:
    return {
        "authz_failed": 403,
        "validation_failed": 422,
        "persist_failed": 500,
        "remote_mcp_failed": 502,
    }.get(error_class, 500)


def _failure_response(
    *,
    run_id: str | None,
    error_class: str,
    error_summary: str,
    stage: str = "failed",
    status_code: int | None = None,
) -> JSONResponse:
    mapped = error_class if error_class in RUN_ERROR_CLASSES else "remote_mcp_failed"
    return JSONResponse(
        status_code=status_code or _failure_status_code(mapped),
        content={
            "ok": False,
            "run_id": run_id,
            "error_class": mapped,
            "error_summary": error_summary,
            "stage": stage,
            "detail": f"{mapped}: {error_summary}",
        },
    )


def _coerce_profile(conn, principal: Principal) -> str:
    display_name = principal.email or principal.uid or "Usuario"
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into profiles (external_auth_id, email, full_name)
            values (%s, %s, %s)
            on conflict (external_auth_id)
            do update set email = excluded.email, full_name = excluded.full_name
            returning id
            """,
            (principal.uid, principal.email, display_name),
        )
        row = cur.fetchone()
        if not row or not row.get("id"):
            raise HTTPException(status_code=500, detail="Could not resolve profile mapping.")
        return str(row["id"])


def _assert_project_access(conn, profile_id: str, project_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select 1
            from project_memberships pm
            where pm.project_id = %s and pm.profile_id = %s
            limit 1
            """,
            (project_id, profile_id),
        )
        if cur.fetchone() is None:
            raise HTTPException(status_code=403, detail="Unauthorized project access.")


def _resolve_project_for_user(conn, profile_id: str, project_id: str | None) -> str | None:
    with conn.cursor() as cur:
        if project_id:
            cur.execute(
                """
                select pm.project_id
                from project_memberships pm
                where pm.project_id = %s and pm.profile_id = %s
                limit 1
                """,
                (project_id, profile_id),
            )
            row = cur.fetchone()
            return str(row["project_id"]) if row else None

        cur.execute(
            """
            select p.id as project_id
            from project_memberships pm
            join projects p on p.id = pm.project_id
            where pm.profile_id = %s
            order by p.created_at desc
            limit 1
            """,
            (profile_id,),
        )
        row = cur.fetchone()
        return str(row["project_id"]) if row else None


def _list_supplies_for_project(conn, project_id: str) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            with project_activity_agg as (
              select
                aps.supply_id,
                sum(coalesce(aps.cantidad_planeada, 0)) as cantidad_planeada_total,
                sum(coalesce(aps.cantidad_ejecutada, 0)) as cantidad_ejecutada_total,
                sum(coalesce(aps.subtotal, coalesce(aps.cantidad_planeada, 0) * coalesce(aps.precio_unitario, 0))) as exposicion_presupuestal
              from activity_supplies aps
              join activities a on a.id = aps.activity_id
              join project_phases ph on ph.id = a.phase_id
              where ph.project_id = %s
              group by aps.supply_id
            ),
            global_projects_per_supply as (
              select
                aps.supply_id,
                count(distinct ph.project_id) as proyectos_impactados
              from activity_supplies aps
              join activities a on a.id = aps.activity_id
              join project_phases ph on ph.id = a.phase_id
              group by aps.supply_id
            ),
            pending_orders as (
              select
                poi.supply_id,
                sum(coalesce(poi.cantidad, 0)) as ordenes_pendientes
              from purchase_order_items poi
              join purchase_orders po on po.id = poi.purchase_order_id
              where po.estado not in ('recibida', 'cancelada')
              group by poi.supply_id
            ),
            latest_prices as (
              select distinct on (r.supply_id)
                r.supply_id,
                r.unit_price,
                b.observed_at
              from supply_price_update_rows r
              join supply_price_update_batches b on b.id = r.batch_id
              where r.status = 'matched' and r.supply_id is not null
              order by r.supply_id, b.observed_at desc, b.created_at desc, r.created_at desc
            )
            select
              s.id,
              s.nombre,
              s.tipo,
              s.unidad_medida,
              coalesce(s.precio_referencia, 0) as precio_referencia,
              coalesce(s.disponibilidad, 'disponible') as disponibilidad,
              coalesce(s.es_critico, false) as es_critico,
              coalesce(paa.exposicion_presupuestal, 0) as exposicion_presupuestal,
              coalesce(paa.cantidad_planeada_total, 0) as cantidad_planeada_total,
              coalesce(paa.cantidad_ejecutada_total, 0) as cantidad_ejecutada_total,
              coalesce(po.ordenes_pendientes, 0) as ordenes_pendientes,
              coalesce(gps.proyectos_impactados, 0) as proyectos_impactados,
              lp.unit_price as latest_unit_price,
              lp.observed_at as latest_observed_at
            from supply_catalog s
            left join project_activity_agg paa on paa.supply_id = s.id
            left join pending_orders po on po.supply_id = s.id
            left join global_projects_per_supply gps on gps.supply_id = s.id
            left join latest_prices lp on lp.supply_id = s.id
            where s.activo = true
            order by s.es_critico desc, s.nombre asc
            """,
            (project_id,),
        )
        rows = cur.fetchall()

    result: list[dict[str, Any]] = []
    for row in rows:
        precio_ref = _to_number(row["precio_referencia"])
        precio_actual = (
            _to_number(row["latest_unit_price"])
            if row.get("latest_unit_price") is not None
            else precio_ref
        )
        variacion_abs = precio_actual - precio_ref
        variacion_pct = (variacion_abs / precio_ref * 100) if precio_ref > 0 else 0.0

        item = {
            "id": row["id"],
            "nombre": row["nombre"],
            "tipo": row["tipo"],
            "unidad_medida": row["unidad_medida"],
            "precio_referencia": precio_ref,
            "precio_actual": precio_actual,
            "variacion_precio_abs": variacion_abs,
            "variacion_precio_pct": variacion_pct,
            "tiene_actualizacion_precio": row.get("latest_observed_at") is not None,
            "fecha_precio_actualizacion": row.get("latest_observed_at"),
            "disponibilidad": row["disponibilidad"],
            "es_critico": bool(row["es_critico"]),
            "exposicion_presupuestal": _to_number(row["exposicion_presupuestal"]),
            "cantidad_planeada_total": _to_number(row["cantidad_planeada_total"]),
            "cantidad_ejecutada_total": _to_number(row["cantidad_ejecutada_total"]),
            "ordenes_pendientes": _to_number(row["ordenes_pendientes"]),
            "proyectos_impactados": _as_int(row["proyectos_impactados"], 0),
        }
        result.append(item)
    return result


def _empty_dashboard_payload() -> dict[str, Any]:
    return {
        "project": None,
        "totals": {
            "presupuesto_total": 0,
            "gasto_ejecutado": 0,
            "avance": 0,
            "incidentes_abiertos": 0,
            "insumos_criticos_alerta": 0,
            "exposicion_critica": 0,
            "ordenes_prioritarias": 0,
            "saldo_por_pagar": 0,
            "nomina_pagada": 0,
        },
        "priceRisk": {
            "hasPriceUpdates": False,
            "lastUpdateDate": None,
            "changedSupplies": 0,
            "suppliesAtRisk": 0,
            "criticalSupplies": 0,
            "affectedBudget": 0,
            "projectedAdditionalCost": 0,
            "projectedBudget": 0,
            "projectedOverrunAmount": 0,
            "projectedOverrunPercent": 0,
            "severity": "ok",
            "topImpacts": [],
        },
        "alerts": [],
        "topCriticalSupplies": [],
        "curva": None,
    }


def _project_summary_row(conn, project_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              m.project_id as id,
              m.project_nombre as nombre,
              m.estado,
              coalesce(m.avance_global_percent, 0) as avance_global_percent,
              m.avance_planeado_percent,
              coalesce(m.presupuesto_total, 0) as presupuesto_total,
              coalesce(m.gasto_ejecutado, 0) as gasto_ejecutado,
              m.spi_basico as spi,
              m.cpi_basico as cpi,
              coalesce(m.incidentes_abiertos, 0) as incidentes_abiertos
            from management_report_data m
            where m.project_id = %s
            limit 1
            """,
            (project_id,),
        )
        return cur.fetchone()


def _project_curve_source(conn, project_id: str) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              p.fecha_inicio_planeada,
              p.fecha_fin_planeada,
              coalesce(m.presupuesto_total, p.presupuesto_total, 0) as total_budget,
              coalesce(m.gasto_ejecutado, 0) as total_actual_cost
            from projects p
            left join management_report_data m on m.project_id = p.id
            where p.id = %s
            limit 1
            """,
            (project_id,),
        )
        project_meta = cur.fetchone()

        cur.execute(
            """
            select
              ph.nombre,
              ph.fecha_inicio,
              ph.fecha_fin,
              coalesce(ph.costo_planeado, 0) as costo_planeado,
              coalesce(ph.costo_real, 0) as costo_real,
              coalesce(ph.porcentaje_completado, 0) as porcentaje_completado
            from project_phases ph
            where ph.project_id = %s
            order by ph.sort_order asc
            """,
            (project_id,),
        )
        phases = cur.fetchall()

    return {
        "projectStart": project_meta.get("fecha_inicio_planeada") if project_meta else None,
        "projectEnd": project_meta.get("fecha_fin_planeada") if project_meta else None,
        "totalBudget": _to_number(project_meta.get("total_budget") if project_meta else 0, 0),
        "totalActualCost": _to_number(
            project_meta.get("total_actual_cost") if project_meta else 0,
            0,
        ),
        "phases": phases,
    }


def _project_financial_totals(conn, project_id: str) -> dict[str, float]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select coalesce(sum(coalesce(poi.subtotal, coalesce(poi.cantidad, 0) * coalesce(poi.precio_unitario, 0))), 0) as ordenes_prioritarias
            from purchase_order_items poi
            join purchase_orders po on po.id = poi.purchase_order_id
            where po.project_id = %s
              and poi.es_prioritario = true
            """,
            (project_id,),
        )
        ordenes_prioritarias = _to_number((cur.fetchone() or {}).get("ordenes_prioritarias"), 0)

        cur.execute(
            """
            select coalesce(sum(sp.monto), 0) as saldo_por_pagar
            from supplier_payments sp
            join purchase_orders po on po.id = sp.purchase_order_id
            where po.project_id = %s
              and sp.estado = 'pendiente'
            """,
            (project_id,),
        )
        saldo_por_pagar = _to_number((cur.fetchone() or {}).get("saldo_por_pagar"), 0)

        cur.execute(
            """
            select
              coalesce(
                sum(
                  coalesce(pe.total_neto, coalesce(pe.salario_base, 0) - coalesce(pe.deducciones, 0) + coalesce(pe.bonificaciones, 0))
                ),
                0
              ) as nomina_pagada
            from payroll_entries pe
            join payroll_periods pp on pp.id = pe.payroll_period_id
            where pp.project_id = %s
            """,
            (project_id,),
        )
        nomina_pagada = _to_number((cur.fetchone() or {}).get("nomina_pagada"), 0)

    return {
        "ordenes_prioritarias": ordenes_prioritarias,
        "saldo_por_pagar": saldo_por_pagar,
        "nomina_pagada": nomina_pagada,
    }


def _project_alert_rows(
    conn,
    project_id: str,
    exposure_by_supply: dict[str, float],
) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              a.id as alert_id,
              a.supply_id,
              sc.nombre,
              sc.tipo,
              a.disponibilidad,
              a.mensaje,
              a.created_at as abierta_desde
            from supply_availability_alerts a
            join supply_catalog sc on sc.id = a.supply_id
            where a.estado = 'abierta'
              and exists (
                select 1
                from activity_supplies aps
                join activities act on act.id = aps.activity_id
                join project_phases ph on ph.id = act.phase_id
                where ph.project_id = %s
                  and aps.supply_id = a.supply_id
              )
            order by a.created_at desc
            """,
            (project_id,),
        )
        rows = cur.fetchall()

    alerts: list[dict[str, Any]] = []
    for row in rows:
        supply_id = str(row["supply_id"])
        alerts.append(
            {
                "alert_id": row["alert_id"],
                "supply_id": row["supply_id"],
                "nombre": row["nombre"],
                "tipo": row["tipo"],
                "disponibilidad": row["disponibilidad"],
                "mensaje": row["mensaje"],
                "abierta_desde": row["abierta_desde"],
                "exposicion": _to_number(exposure_by_supply.get(supply_id), 0),
            },
        )
    return alerts


class AgentRunRequest(BaseModel):
    project_id: str
    mode: str = "manual"
    dry_run: bool = False
    horizon_months: int = Field(default=6, ge=1, le=24)
    history_months: int = Field(default=36, ge=12, le=120)
    overrun_threshold_pct: float = Field(default=10.0, ge=0.0, le=100.0)
    material_queries: list[str] | None = None


class ChatPostRequest(BaseModel):
    project_id: str
    message: str
    session_id: str | None = None
    new_session: bool = False


class PhaseInput(BaseModel):
    nombre: str
    sort_order: int | None = None
    fecha_inicio: str | None = None
    fecha_fin: str | None = None
    porcentaje_completado: float | None = None
    costo: float | None = None


class ProjectCreateRequest(BaseModel):
    nombre: str
    descripcion: str | None = None
    ubicacion: str | None = None
    estado: str = "planificacion"
    fecha_inicio_planeada: str | None = None
    fecha_fin_planeada: str | None = None
    fecha_inicio_real: str | None = None
    presupuesto_total: float = 0
    phases: list[PhaseInput] = Field(default_factory=list)


def _run_mcp_tool(args: dict[str, Any], *, run_id: str | None = None) -> dict[str, Any]:
    mcp_url = _mcp_url()
    if not mcp_url:
        raise RuntimeError("SUPPLY_AGENT_MCP_URL is not configured.")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if run_id:
        headers["x-run-id"] = run_id
    if _mcp_bearer():
        headers["Authorization"] = f"Bearer {_mcp_bearer()}"

    timeout = _mcp_timeout_ms() / 1000
    request_args = dict(args)
    if run_id and "run_id" not in request_args:
        request_args["run_id"] = run_id

    with httpx.Client(timeout=timeout) as client:
        init_payload = {
            "jsonrpc": "2.0",
            "id": f"init-{uuid.uuid4()}",
            "method": "initialize",
            "params": {
                "protocolVersion": _mcp_protocol_version(),
                "capabilities": {},
                "clientInfo": {"name": "nexum-api", "version": "0.1.0"},
            },
        }
        init_res = client.post(mcp_url, headers=headers, json=init_payload)
        init_res.raise_for_status()

        session_id = (
            init_res.headers.get("mcp-session-id")
            or init_res.headers.get("Mcp-Session-Id")
            or ""
        )
        if not session_id:
            raise RuntimeError("MCP initialization did not return session id.")

        notify_headers = dict(headers)
        notify_headers["mcp-session-id"] = session_id
        notify_headers["MCP-Protocol-Version"] = _mcp_protocol_version()

        client.post(
            mcp_url,
            headers=notify_headers,
            json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
        ).raise_for_status()

        tool_payload = {
            "jsonrpc": "2.0",
            "id": f"tool-{uuid.uuid4()}",
            "method": "tools/call",
            "params": {"name": "material_price_forecast", "arguments": request_args},
        }
        tool_res = client.post(mcp_url, headers=notify_headers, json=tool_payload)
        tool_res.raise_for_status()

        text = tool_res.text.strip()
        if text.startswith("{"):
            envelope = tool_res.json()
        else:
            envelope = {}
            for line in text.splitlines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                maybe_json = line[5:].strip()
                if maybe_json and maybe_json != "[DONE]":
                    try:
                        envelope = httpx.Response(200, text=maybe_json).json()
                    except Exception:
                        continue

    if isinstance(envelope, dict) and isinstance(envelope.get("error"), dict):
        err = envelope["error"]
        raise RuntimeError(
            f"MCP RPC error {err.get('code')}: {err.get('message') or 'unknown error'}",
        )

    result = envelope.get("result") if isinstance(envelope, dict) else None
    if not isinstance(result, dict):
        raise RuntimeError("Invalid MCP tool response envelope.")

    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured

    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                try:
                    return httpx.Response(200, text=item["text"]).json()
                except Exception:
                    continue

    raise RuntimeError("MCP tool response missing structured payload.")


def _create_run_context(
    conn,
    *,
    run_id: str,
    project_id: str,
    profile_id: str,
    trigger: str,
    dry_run: bool,
    horizon_months: int,
    history_months: int,
    overrun_threshold_pct: float,
) -> None:
    now = _now_iso()
    counters = _empty_run_counters()
    metadata = {
        "triggered_by": profile_id,
        "trigger": trigger,
        "horizon_months": horizon_months,
        "history_months": history_months,
        "overrun_threshold_pct": overrun_threshold_pct,
        "options": {"dry_run": dry_run},
        "lifecycle": {
            "stage": "accepted",
            "status": "running",
            "history": [{"stage": "accepted", "status": "running", "at": now}],
            "updated_at": now,
        },
        "counters": counters,
        "diagnostics": {},
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into supply_agent_runs (
              id, project_id, status, started_at, metadata, updated_at
            )
            values (%s, %s, %s, %s, %s::jsonb, %s)
            on conflict (id)
            do update set
              project_id = excluded.project_id,
              status = excluded.status,
              started_at = excluded.started_at,
              metadata = excluded.metadata,
              updated_at = excluded.updated_at
            """,
            (run_id, project_id, "running", now, json.dumps(metadata), now),
        )


def _persist_run_transition(
    conn,
    *,
    run_id: str,
    target_stage: str,
    status: str,
    counters: dict[str, Any] | None = None,
    diagnostics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_status = _normalize_run_status(status)
    if normalized_status != "running" and target_stage not in RUN_TERMINAL_STAGES:
        raise RuntimeError(
            f"invalid transition payload stage={target_stage} status={normalized_status}",
        )
    if normalized_status == "running" and target_stage in RUN_TERMINAL_STAGES:
        raise RuntimeError(
            f"invalid transition payload stage={target_stage} status={normalized_status}",
        )

    now = _now_iso()
    with conn.cursor() as cur:
        cur.execute(
            """
            select status, started_at, finished_at, error_summary, metadata
            from supply_agent_runs
            where id = %s
            limit 1
            """,
            (run_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("run_not_found")

        current_status = _normalize_run_status(row.get("status"))
        metadata = row.get("metadata") or {}
        lifecycle = metadata.get("lifecycle") if isinstance(metadata.get("lifecycle"), dict) else {}
        current_stage = lifecycle.get("stage") if isinstance(lifecycle.get("stage"), str) else None

        if current_status in TERMINAL_STATUSES and normalized_status != current_status:
            raise RuntimeError(
                f"terminal_state_immutable current={current_status} target={normalized_status}",
            )

        if not _is_valid_stage_transition(current_stage, target_stage):
            raise RuntimeError(
                f"invalid_stage_transition current={current_stage} target={target_stage}",
            )

        updated_history = lifecycle.get("history") if isinstance(lifecycle.get("history"), list) else []
        if not updated_history or updated_history[-1].get("stage") != target_stage:
            updated_history = [
                *updated_history,
                {"stage": target_stage, "status": normalized_status, "at": now},
            ]

        lifecycle_payload = {
            "stage": target_stage,
            "status": normalized_status,
            "updated_at": now,
            "history": updated_history,
        }
        metadata["lifecycle"] = lifecycle_payload
        metadata["stage"] = target_stage

        merged_counters = _empty_run_counters()
        stored_counters = metadata.get("counters") if isinstance(metadata.get("counters"), dict) else {}
        merged_counters.update(
            {k: _as_int(v, merged_counters.get(k, 0)) for k, v in stored_counters.items()},
        )
        if counters:
            merged_counters.update({k: _as_int(v, merged_counters.get(k, 0)) for k, v in counters.items()})
        metadata["counters"] = merged_counters

        merged_diagnostics = (
            metadata.get("diagnostics") if isinstance(metadata.get("diagnostics"), dict) else {}
        )
        if diagnostics:
            merged_diagnostics = {**merged_diagnostics, **diagnostics}
        metadata["diagnostics"] = merged_diagnostics
        if isinstance(merged_diagnostics.get("error_class"), str):
            metadata["error_class"] = merged_diagnostics["error_class"]
        if isinstance(merged_diagnostics.get("error_summary"), str):
            metadata["error_summary"] = merged_diagnostics["error_summary"]

        payload_status = current_status if current_status in TERMINAL_STATUSES else normalized_status
        if payload_status in TERMINAL_STATUSES and normalized_status in TERMINAL_STATUSES:
            payload_status = normalized_status

        finished_at = row.get("finished_at")
        if payload_status in TERMINAL_STATUSES and finished_at is None:
            finished_at = now

        error_summary = row.get("error_summary")
        if isinstance(merged_diagnostics.get("error_summary"), str):
            error_summary = merged_diagnostics["error_summary"]

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
            (payload_status, finished_at, error_summary, json.dumps(metadata), now, run_id),
        )

        return {
            "stage": target_stage,
            "status": payload_status,
            "counters": merged_counters,
            "diagnostics": merged_diagnostics,
        }


def _current_run_lifecycle(conn, *, run_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select status, metadata
            from supply_agent_runs
            where id = %s
            limit 1
            """,
            (run_id,),
        )
        row = cur.fetchone()
    if not row:
        return None

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    lifecycle = metadata.get("lifecycle") if isinstance(metadata.get("lifecycle"), dict) else {}
    stage = lifecycle.get("stage") if isinstance(lifecycle.get("stage"), str) else None
    status = _normalize_run_status(row.get("status"))
    return {"stage": stage, "status": status}


def _latest_agent_run(conn, project_id: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, project_id, status, started_at, finished_at, error_summary, metadata, created_at
            from supply_agent_runs
            where project_id = %s
            order by created_at desc
            limit 1
            """,
            (project_id,),
        )
        return cur.fetchone()


@app.middleware("http")
async def attach_run_id(request: Request, call_next):
    request.state.run_id = _coerce_run_id(request.headers.get("x-run-id"))
    response = await call_next(request)
    response.headers["x-run-id"] = request.state.run_id
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "nexum-api"}


@app.get("/projects")
def list_projects(request: Request, principal: Principal = Depends(resolve_principal)):
    try:
        with get_conn() as conn:
            profile_id = _coerce_profile(conn, principal)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      p.id,
                      p.nombre,
                      p.descripcion,
                      p.ubicacion,
                      p.estado,
                      p.fecha_inicio_planeada,
                      p.fecha_fin_planeada,
                      p.fecha_inicio_real,
                      p.created_at,
                      coalesce(m.presupuesto_total, p.presupuesto_total, 0) as presupuesto_total,
                      coalesce(m.gasto_ejecutado, 0) as gasto_ejecutado,
                      coalesce(m.avance_global_percent, 0) as avance,
                      m.spi_basico as spi,
                      m.cpi_basico as cpi,
                      coalesce(m.incidentes_abiertos, 0) as incidentes_abiertos
                    from project_memberships pm
                    join projects p on p.id = pm.project_id
                    left join management_report_data m on m.project_id = p.id
                    where pm.profile_id = %s
                    order by p.created_at desc
                    """,
                    (profile_id,),
                )
                rows = cur.fetchall()
            conn.commit()
            return rows
    except DbConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/projects")
def create_project(
    payload: ProjectCreateRequest,
    principal: Principal = Depends(resolve_principal),
):
    try:
        with get_conn() as conn:
            profile_id = _coerce_profile(conn, principal)
            project_id = create_project_with_bootstrap(
                conn,
                creator_profile_id=profile_id,
                payload=payload.model_dump(),
            )
            conn.commit()
            return {"ok": True, "project_id": project_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DbConfigError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/projects/{project_id}/exists")
def project_exists(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        with conn.cursor() as cur:
            cur.execute(
                """
                select 1 from project_memberships
                where project_id = %s and profile_id = %s
                limit 1
                """,
                (project_id, profile_id),
            )
            exists = cur.fetchone() is not None
        conn.commit()
        return {"exists": exists}


@app.get("/projects/{project_id}/basic")
def project_basic(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)
        with conn.cursor() as cur:
            cur.execute("select id, nombre from projects where id = %s", (project_id,))
            row = cur.fetchone()
        conn.commit()
        return {"project": row}


@app.get("/projects/{project_id}/curve-source")
def project_curve_source(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)
        payload = _project_curve_source(conn, project_id)
        conn.commit()
        return payload


@app.delete("/projects/{project_id}")
def delete_project(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)
        with conn.cursor() as cur:
            cur.execute("delete from projects where id = %s", (project_id,))
            deleted = cur.rowcount or 0
        conn.commit()
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
        return {"ok": True, "project_id": project_id}


@app.get("/dashboard/summary")
def dashboard_summary(
    request: Request,
    project_id: str | None = Query(default=None),
    principal: Principal = Depends(resolve_principal),
):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        resolved_project_id = _resolve_project_for_user(conn, profile_id, project_id)
        if not resolved_project_id:
            return _empty_dashboard_payload()

        project = _project_summary_row(conn, resolved_project_id)
        if not project:
            return _empty_dashboard_payload()

        supplies = _list_supplies_for_project(conn, resolved_project_id)
        exposure_by_supply = {
            str(s["id"]): _to_number(s.get("exposicion_presupuestal"), 0) for s in supplies
        }
        alerts = _project_alert_rows(conn, resolved_project_id, exposure_by_supply)
        top_critical = sorted(
            [s for s in supplies if s["es_critico"]],
            key=lambda item: float(item["exposicion_presupuestal"]),
            reverse=True,
        )[:6]

        financial_totals = _project_financial_totals(conn, resolved_project_id)

        price_risk_rows: list[dict[str, Any]] = []
        for supply in supplies:
            qty = _to_number(supply.get("cantidad_planeada_total"), 0)
            if qty <= 0 or not supply.get("tiene_actualizacion_precio"):
                continue

            baseline_amount = _to_number(supply.get("exposicion_presupuestal"), 0)
            baseline_unit_price = (baseline_amount / qty) if baseline_amount > 0 else _to_number(
                supply.get("precio_referencia"), 0
            )
            current_unit_price = _to_number(supply.get("precio_actual"), 0)
            projected_amount = qty * current_unit_price
            impact_amount = projected_amount - baseline_amount
            unit_price_change_pct = (
                ((current_unit_price - baseline_unit_price) / baseline_unit_price) * 100
                if baseline_unit_price > 0
                else 0
            )

            severity = "ok"
            if unit_price_change_pct >= 10:
                severity = "critical"
            elif unit_price_change_pct >= 5:
                severity = "warn"

            price_risk_rows.append(
                {
                    "supply_id": supply["id"],
                    "nombre": supply["nombre"],
                    "tipo": supply["tipo"],
                    "unidad_medida": supply["unidad_medida"],
                    "cantidad_planeada_total": qty,
                    "baseline_unit_price": baseline_unit_price,
                    "current_unit_price": current_unit_price,
                    "unit_price_change_pct": unit_price_change_pct,
                    "baseline_amount": baseline_amount,
                    "projected_amount": projected_amount,
                    "impact_amount": impact_amount,
                    "severity": severity,
                },
            )

        price_risk_rows.sort(key=lambda row: _to_number(row["impact_amount"]), reverse=True)
        rows_at_risk = [row for row in price_risk_rows if _to_number(row["impact_amount"]) > 0]

        projected_additional_cost = sum(_to_number(row["impact_amount"]) for row in rows_at_risk)
        presupuesto = _to_number(project.get("presupuesto_total"), 0)
        projected_budget = presupuesto + projected_additional_cost
        projected_overrun_amount = max(projected_budget - presupuesto, 0)
        projected_overrun_percent = (
            (projected_overrun_amount / presupuesto) * 100 if presupuesto > 0 else 0
        )
        affected_budget = sum(_to_number(row["baseline_amount"]) for row in rows_at_risk)

        last_update_candidates = [
            supply.get("fecha_precio_actualizacion")
            for supply in supplies
            if supply.get("fecha_precio_actualizacion")
        ]
        last_update = max(last_update_candidates) if last_update_candidates else None

        critical_supplies = len([row for row in rows_at_risk if row["severity"] == "critical"])
        warn_supplies = len([row for row in rows_at_risk if row["severity"] == "warn"])
        price_risk_severity = (
            "critical" if critical_supplies > 0 else "warn" if warn_supplies > 0 else "ok"
        )

        conn.commit()

        return {
            "project": project,
            "totals": {
                "presupuesto_total": presupuesto,
                "gasto_ejecutado": _to_number(project.get("gasto_ejecutado"), 0),
                "avance": _to_number(project.get("avance_global_percent"), 0),
                "incidentes_abiertos": _as_int(project.get("incidentes_abiertos"), 0),
                "insumos_criticos_alerta": len(alerts),
                "exposicion_critica": sum(_to_number(alert.get("exposicion"), 0) for alert in alerts),
                "ordenes_prioritarias": financial_totals["ordenes_prioritarias"],
                "saldo_por_pagar": financial_totals["saldo_por_pagar"],
                "nomina_pagada": financial_totals["nomina_pagada"],
            },
            "priceRisk": {
                "hasPriceUpdates": any(supply.get("tiene_actualizacion_precio") for supply in supplies),
                "lastUpdateDate": last_update,
                "changedSupplies": len(
                    [
                        row
                        for row in price_risk_rows
                        if abs(_to_number(row["unit_price_change_pct"])) >= 0.1
                    ]
                ),
                "suppliesAtRisk": len(rows_at_risk),
                "criticalSupplies": critical_supplies,
                "affectedBudget": affected_budget,
                "projectedAdditionalCost": projected_additional_cost,
                "projectedBudget": projected_budget,
                "projectedOverrunAmount": projected_overrun_amount,
                "projectedOverrunPercent": projected_overrun_percent,
                "severity": price_risk_severity,
                "topImpacts": rows_at_risk[:8],
            },
            "alerts": alerts,
            "topCriticalSupplies": top_critical,
            "curva": None,
        }


@app.get("/supplies")
def list_global_supplies(
    principal: Principal = Depends(resolve_principal),
):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        project_id = _resolve_project_for_user(conn, profile_id, None)
        if not project_id:
            return []
        supplies = _list_supplies_for_project(conn, project_id)
        conn.commit()
        return supplies


@app.get("/projects/{project_id}/supplies")
def list_project_supplies(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)
        supplies = _list_supplies_for_project(conn, project_id)
        conn.commit()
        return supplies


@app.get("/projects/{project_id}/agent-overrun-snapshot")
def agent_overrun_snapshot(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)
        fallback_row = None
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "select * from agent_overrun_snapshot where project_id = %s limit 1",
                    (project_id,),
                )
                fallback_row = cur.fetchone()
            except Exception:
                fallback_row = None

        run_row = None
        try:
            run_row = _latest_agent_run(conn, project_id)
        except Exception:
            run_row = None

        conn.commit()

        if not run_row:
            if fallback_row:
                status = _normalize_run_status(fallback_row.get("last_run_status"))
                state = status if status in {"running", "completed", "failed"} else "not_started"
                if state == "not_started":
                    fallback_row["last_run_status"] = None
                return {"snapshot": fallback_row, "state": state}
            return {"snapshot": None, "state": "not_started"}

        metadata = run_row.get("metadata") if isinstance(run_row.get("metadata"), dict) else {}
        counters = metadata.get("counters") if isinstance(metadata.get("counters"), dict) else {}
        budget_summary = metadata.get("budget_summary") if isinstance(metadata.get("budget_summary"), dict) else {}
        lifecycle = metadata.get("lifecycle") if isinstance(metadata.get("lifecycle"), dict) else {}

        raw_status = run_row.get("status") or lifecycle.get("status")
        normalized_status = _normalize_run_status(raw_status)
        explicit_status = (
            normalized_status
            if normalized_status in {"running", "completed", "failed"}
            else "running"
        )

        snapshot = dict(fallback_row or {})
        snapshot.update(
            {
                "project_id": project_id,
                "last_run_id": str(run_row.get("id")),
                "last_run_mode": metadata.get("trigger"),
                "last_run_status": explicit_status,
                "last_run_started_at": run_row.get("started_at"),
                "last_run_finished_at": run_row.get("finished_at"),
                "supplies_targeted": _as_int(
                    counters.get("supplies_requested"),
                    _as_int(snapshot.get("supplies_targeted"), 0),
                ),
                "supplies_scraped_ok": _as_int(
                    counters.get("supplies_processed"),
                    _as_int(snapshot.get("supplies_scraped_ok"), 0),
                ),
                "supplies_scraped_failed": _as_int(
                    counters.get("errors"),
                    _as_int(snapshot.get("supplies_scraped_failed"), 0),
                ),
                "forecast_points_written": _as_int(
                    counters.get("forecasts_written"),
                    _as_int(snapshot.get("forecast_points_written"), 0),
                ),
                "alerts_triggered": _as_int(
                    counters.get("alerts_created"),
                    _as_int(snapshot.get("alerts_triggered"), 0),
                ),
                "error_summary": (
                    run_row.get("error_summary")
                    or metadata.get("error_summary")
                    or snapshot.get("error_summary")
                ),
                "baseline_budget": _to_number(
                    budget_summary.get("total_budget_subtotal"),
                    _to_number(snapshot.get("baseline_budget"), 0),
                ),
                "projected_total_cost": _to_number(
                    budget_summary.get("projected_subtotal"),
                    _to_number(snapshot.get("projected_total_cost"), 0),
                ),
                "overrun_amount": _to_number(
                    budget_summary.get("estimated_indexed_delta"),
                    _to_number(snapshot.get("overrun_amount"), 0),
                ),
                "overrun_pct": _to_number(
                    budget_summary.get("estimated_indexed_delta_pct"),
                    _to_number(snapshot.get("overrun_pct"), 0),
                ),
                "threshold_pct": _to_number(
                    metadata.get("overrun_threshold_pct"),
                    _to_number(snapshot.get("threshold_pct"), 0),
                ),
            },
        )
        if not snapshot.get("project_nombre"):
            snapshot["project_nombre"] = ""

        return {"snapshot": snapshot, "state": explicit_status}


@app.get("/projects/{project_id}/costs")
def project_costs(project_id: str, principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)

        with conn.cursor() as cur:
            project = _project_summary_row(conn, project_id)

            cur.execute(
                """
                select
                  ph.id as phase_id,
                  ph.nombre,
                  coalesce(sum(coalesce(aps.subtotal, coalesce(aps.cantidad_planeada, 0) * coalesce(aps.precio_unitario, 0))), 0) as presupuesto,
                  coalesce(sum(coalesce(aps.cantidad_ejecutada, 0) * coalesce(aps.precio_unitario, 0)), 0) as ejecutado_aprox,
                  coalesce(avg(a.progress_percentage), 0) as avance_promedio
                from project_phases ph
                left join activities a on a.phase_id = ph.id
                left join activity_supplies aps on aps.activity_id = a.id
                where ph.project_id = %s
                group by ph.id, ph.nombre, ph.sort_order
                order by ph.sort_order asc
                """,
                (project_id,),
            )
            budget_by_phase = cur.fetchall()

            cur.execute(
                """
                with po_totals as (
                  select
                    po.id,
                    po.order_number,
                    po.estado,
                    po.fecha_emision,
                    po.fecha_entrega_esperada,
                    s.nombre as supplier_nombre,
                    coalesce(sum(coalesce(poi.subtotal, coalesce(poi.cantidad, 0) * coalesce(poi.precio_unitario, 0))), 0) as total,
                    bool_or(coalesce(poi.es_prioritario, false)) as prioritario,
                    count(poi.id) as items_count
                  from purchase_orders po
                  left join suppliers s on s.id = po.supplier_id
                  left join purchase_order_items poi on poi.purchase_order_id = po.id
                  where po.project_id = %s
                  group by po.id, po.order_number, po.estado, po.fecha_emision, po.fecha_entrega_esperada, s.nombre
                ),
                po_paid as (
                  select
                    po.id as purchase_order_id,
                    coalesce(sum(sp.monto) filter (where sp.estado = 'pagado'), 0) as pagado
                  from purchase_orders po
                  left join supplier_payments sp on sp.purchase_order_id = po.id
                  where po.project_id = %s
                  group by po.id
                )
                select
                  pt.id,
                  pt.order_number,
                  pt.estado,
                  pt.fecha_emision,
                  pt.fecha_entrega_esperada,
                  coalesce(pt.supplier_nombre, '—') as supplier_nombre,
                  pt.total,
                  pt.prioritario,
                  coalesce(pp.pagado, 0) as pagado,
                  greatest(pt.total - coalesce(pp.pagado, 0), 0) as saldo,
                  pt.items_count
                from po_totals pt
                left join po_paid pp on pp.purchase_order_id = pt.id
                order by pt.fecha_emision desc nulls last
                """,
                (project_id, project_id),
            )
            purchase_orders = cur.fetchall()

            cur.execute(
                """
                select
                  coalesce(sum(sp.monto) filter (where sp.estado = 'pagado'), 0) as pagos_proveedores,
                  coalesce(sum(sp.monto) filter (where sp.estado = 'pendiente'), 0) as pagos_pendientes
                from supplier_payments sp
                join purchase_orders po on po.id = sp.purchase_order_id
                where po.project_id = %s
                """,
                (project_id,),
            )
            payment_totals = cur.fetchone() or {}

            cur.execute(
                """
                select
                  coalesce(
                    sum(
                      coalesce(pe.total_neto, coalesce(pe.salario_base, 0) - coalesce(pe.deducciones, 0) + coalesce(pe.bonificaciones, 0))
                    ),
                    0
                  ) as nomina_total
                from payroll_entries pe
                join payroll_periods pp on pp.id = pe.payroll_period_id
                where pp.project_id = %s
                """,
                (project_id,),
            )
            nomina_total = _to_number((cur.fetchone() or {}).get("nomina_total"), 0)

        ordenes_prioritarias = sum(
            _to_number(po.get("total"), 0) for po in purchase_orders if bool(po.get("prioritario"))
        )
        pagos_proveedores = _to_number(payment_totals.get("pagos_proveedores"), 0)
        pagos_pendientes = _to_number(payment_totals.get("pagos_pendientes"), 0)

        conn.commit()
        return {
            "project": project,
            "budgetByPhase": budget_by_phase,
            "purchaseOrders": purchase_orders,
            "nominaTotal": nomina_total,
            "pagosProveedores": pagos_proveedores,
            "pagosPendientes": pagos_pendientes,
            "ordenesPrioritarias": ordenes_prioritarias,
            "gastoPorCategoria": [
                {"categoria": "Proveedores (pagado)", "monto": pagos_proveedores},
                {"categoria": "Nómina", "monto": nomina_total},
                {"categoria": "Saldo proveedores pendiente", "monto": pagos_pendientes},
            ],
        }


@app.get("/costs/summary")
def costs_summary(principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        project_id = _resolve_project_for_user(conn, profile_id, None)
        conn.commit()
        if not project_id:
            return {
                "project": None,
                "budgetByPhase": [],
                "purchaseOrders": [],
                "nominaTotal": 0,
                "pagosProveedores": 0,
                "pagosPendientes": 0,
                "ordenesPrioritarias": 0,
                "gastoPorCategoria": [],
            }
    return project_costs(project_id=project_id, principal=principal)


@app.get("/supplies/price-batches")
def recent_price_batches(
    limit: int = Query(default=12, ge=1, le=100),
    principal: Principal = Depends(resolve_principal),
):
    with get_conn() as conn:
        _coerce_profile(conn, principal)
        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  b.id,
                  b.source_file_name,
                  b.observed_at,
                  b.created_at,
                  coalesce(count(r.id), 0) as total_rows,
                  coalesce(count(r.id) filter (where r.status = 'matched'), 0) as matched_rows,
                  coalesce(count(r.id) filter (where r.status = 'unmatched'), 0) as unmatched_rows
                from supply_price_update_batches b
                left join supply_price_update_rows r on r.batch_id = b.id
                group by b.id, b.source_file_name, b.observed_at, b.created_at
                order by b.created_at desc
                limit %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
        conn.commit()
        return rows


@app.get("/profiles/me")
def profile_me(principal: Principal = Depends(resolve_principal)):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, full_name, email, job_title
                from profiles
                where id = %s
                limit 1
                """,
                (profile_id,),
            )
            row = cur.fetchone()
        conn.commit()
        return row


@app.post("/agent/run-supply-cost")
def run_supply_cost_agent(
    payload: AgentRunRequest,
    request: Request,
    principal: Principal = Depends(resolve_principal),
):
    run_id = _coerce_run_id(getattr(request.state, "run_id", None))
    request.state.run_id = run_id
    profile_id: str | None = None
    run_started_monotonic = time.monotonic()

    def _record_transition(
        *,
        target_stage: str,
        status: str,
        counters: dict[str, Any] | None = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        stage_started = time.monotonic()
        with get_conn() as conn:
            result = _persist_run_transition(
                conn,
                run_id=run_id,
                target_stage=target_stage,
                status=status,
                counters=counters,
                diagnostics=diagnostics,
            )
            conn.commit()
        _log_run_event(
            "run.stage_completed",
            run_id=run_id,
            project_id=payload.project_id,
            profile_id=profile_id or "unknown",
            stage=result["stage"],
            status=result["status"],
            error_class=(result.get("diagnostics") or {}).get("error_class"),
            duration_ms=int((time.monotonic() - stage_started) * 1000),
        )
        return result

    try:
        with get_conn() as conn:
            profile_id = _coerce_profile(conn, principal)
            _assert_project_access(conn, profile_id, payload.project_id)
            _create_run_context(
                conn,
                run_id=run_id,
                project_id=payload.project_id,
                profile_id=profile_id,
                trigger=payload.mode,
                dry_run=payload.dry_run,
                horizon_months=payload.horizon_months or _default_horizon(),
                history_months=payload.history_months or _default_history(),
                overrun_threshold_pct=(
                    payload.overrun_threshold_pct or _default_overrun_threshold_pct()
                ),
            )
            conn.commit()
    except HTTPException as exc:
        if exc.status_code == 403:
            return _failure_response(
                run_id=run_id,
                error_class="authz_failed",
                error_summary="Unauthorized project access.",
                stage="accepted",
                status_code=403,
            )
        raise
    except Exception as exc:
        return _failure_response(
            run_id=run_id,
            error_class="persist_failed",
            error_summary=f"Could not initialize run context: {exc}",
            stage="accepted",
        )

    _log_run_event(
        "run.accepted",
        run_id=run_id,
        project_id=payload.project_id,
        profile_id=profile_id or "unknown",
        stage="accepted",
        status="running",
    )
    _log_run_event(
        "run.stage_started",
        run_id=run_id,
        project_id=payload.project_id,
        profile_id=profile_id or "unknown",
        stage="selecting_targets",
        status="running",
    )
    try:
        _record_transition(target_stage="selecting_targets", status="running")
    except Exception as exc:
        return _failure_response(
            run_id=run_id,
            error_class="persist_failed",
            error_summary=f"Could not persist selecting_targets stage: {exc}",
            stage="selecting_targets",
        )

    tool_args = {
        "user_id": profile_id,
        "project_id": payload.project_id,
        "horizon_months": payload.horizon_months or _default_horizon(),
        "history_months": payload.history_months or _default_history(),
        "overrun_threshold_pct": payload.overrun_threshold_pct or _default_overrun_threshold_pct(),
        "persist": not payload.dry_run,
        "trigger": payload.mode,
        "dry_run": payload.dry_run,
    }
    if payload.material_queries:
        tool_args["material_queries"] = payload.material_queries

    try:
        remote = _run_mcp_tool(tool_args, run_id=run_id)
    except Exception as exc:
        error_summary = str(exc)
        diagnostics = {
            "error_class": "remote_mcp_failed",
            "error_summary": error_summary,
            "last_stage": "selecting_targets",
        }
        try:
            _record_transition(
                target_stage="failed",
                status="failed",
                counters=_empty_run_counters(),
                diagnostics=diagnostics,
            )
        except Exception as persist_exc:
            return _failure_response(
                run_id=run_id,
                error_class="persist_failed",
                error_summary=f"Could not persist failed run state: {persist_exc}",
                stage="failed",
            )
        _log_run_event(
            "run.failed",
            run_id=run_id,
            project_id=payload.project_id,
            profile_id=profile_id or "unknown",
            stage="failed",
            status="failed",
            error_class="remote_mcp_failed",
            duration_ms=int((time.monotonic() - run_started_monotonic) * 1000),
        )
        return _failure_response(
            run_id=run_id,
            error_class="remote_mcp_failed",
            error_summary=error_summary,
            stage="failed",
        )

    normalized = _normalize_mcp_envelope(remote, fallback_run_id=run_id)
    counters = normalized["counters"]
    diagnostics = normalized["diagnostics"] if isinstance(normalized["diagnostics"], dict) else {}
    persisted_lifecycle: dict[str, Any] | None = None

    try:
        with get_conn() as conn:
            persisted_lifecycle = _current_run_lifecycle(conn, run_id=run_id)
            conn.commit()
    except Exception:
        persisted_lifecycle = None

    if normalized["status"] != "completed":
        error_summary = (
            diagnostics.get("error_summary")
            if isinstance(diagnostics.get("error_summary"), str)
            else "MCP tool execution failed."
        )
        error_class = (
            diagnostics.get("error_class")
            if isinstance(diagnostics.get("error_class"), str)
            else _classify_failure(error_summary, default="remote_mcp_failed")
        )
        try:
            failed_diagnostics = {**diagnostics, "error_class": error_class, "error_summary": error_summary}
            _record_transition(
                target_stage="failed",
                status="failed",
                counters=counters,
                diagnostics=failed_diagnostics,
            )
        except Exception as persist_exc:
            return _failure_response(
                run_id=run_id,
                error_class="persist_failed",
                error_summary=f"Could not persist failed run state: {persist_exc}",
                stage="failed",
            )
        _log_run_event(
            "run.failed",
            run_id=run_id,
            project_id=payload.project_id,
            profile_id=profile_id or "unknown",
            stage="failed",
            status="failed",
            error_class=error_class,
            duration_ms=int((time.monotonic() - run_started_monotonic) * 1000),
        )
        return _failure_response(
            run_id=run_id,
            error_class=error_class,
            error_summary=error_summary,
            stage="failed",
        )

    if persisted_lifecycle and persisted_lifecycle.get("status") == "completed":
        _log_run_event(
            "run.completed",
            run_id=run_id,
            project_id=payload.project_id,
            profile_id=profile_id or "unknown",
            stage="completed",
            status="completed",
            duration_ms=int((time.monotonic() - run_started_monotonic) * 1000),
        )
        return {
            "ok": True,
            "phase": "phase2_remote_mcp",
            "run_id": run_id,
            "supplies_scraped_ok": _as_int(counters.get("supplies_processed"), 0),
            "supplies_scraped_failed": _as_int(counters.get("errors"), 0),
            "forecast_points_written": _as_int(counters.get("forecasts_written"), 0),
            "alerts_triggered": _as_int(counters.get("alerts_created"), 0),
        }

    for stage in ("fetching_market_data", "forecasting", "computing_risk", "persisting"):
        _log_run_event(
            "run.stage_started",
            run_id=run_id,
            project_id=payload.project_id,
            profile_id=profile_id or "unknown",
            stage=stage,
            status="running",
        )
        try:
            _record_transition(target_stage=stage, status="running", counters=counters, diagnostics=diagnostics)
        except Exception as exc:
            return _failure_response(
                run_id=run_id,
                error_class="persist_failed",
                error_summary=f"Could not persist stage {stage}: {exc}",
                stage=stage,
            )

    _log_run_event(
        "run.stage_started",
        run_id=run_id,
        project_id=payload.project_id,
        profile_id=profile_id or "unknown",
        stage="completed",
        status="completed",
    )
    try:
        _record_transition(
            target_stage="completed",
            status="completed",
            counters=counters,
            diagnostics=diagnostics,
        )
    except Exception as exc:
        return _failure_response(
            run_id=run_id,
            error_class="persist_failed",
            error_summary=f"Could not persist completed state: {exc}",
            stage="completed",
        )

    _log_run_event(
        "run.completed",
        run_id=run_id,
        project_id=payload.project_id,
        profile_id=profile_id or "unknown",
        stage="completed",
        status="completed",
        duration_ms=int((time.monotonic() - run_started_monotonic) * 1000),
    )

    return {
        "ok": True,
        "phase": "phase2_remote_mcp",
        "run_id": run_id,
        "supplies_scraped_ok": _as_int(counters.get("supplies_processed"), 0),
        "supplies_scraped_failed": _as_int(counters.get("errors"), 0),
        "forecast_points_written": _as_int(counters.get("forecasts_written"), 0),
        "alerts_triggered": _as_int(counters.get("alerts_created"), 0),
    }


@app.get("/chat/messages")
def get_chat_messages(
    project_id: str,
    session_id: str | None = None,
    principal: Principal = Depends(resolve_principal),
):
    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, project_id)

        with conn.cursor() as cur:
            if session_id:
                cur.execute(
                    """
                    select id, title, created_at, updated_at
                    from project_chat_sessions
                    where id = %s and project_id = %s
                    limit 1
                    """,
                    (session_id, project_id),
                )
            else:
                cur.execute(
                    """
                    select id, title, created_at, updated_at
                    from project_chat_sessions
                    where project_id = %s and created_by = %s
                    order by last_message_at desc
                    limit 1
                    """,
                    (project_id, profile_id),
                )
            session = cur.fetchone()

            if not session:
                conn.commit()
                return {"ok": True, "session": None, "messages": []}

            cur.execute(
                """
                select id, session_id, project_id, role, content, metadata, created_at
                from project_chat_messages
                where project_id = %s and session_id = %s
                order by created_at asc
                limit 120
                """,
                (project_id, session["id"]),
            )
            messages = cur.fetchall()

        conn.commit()
        return {"ok": True, "session": session, "messages": messages}


def _build_deterministic_answer(project: dict[str, Any] | None, message: str) -> str:
    if not project:
        return "No encontramos un resumen del proyecto para responder con datos trazables."

    presupuesto = _to_number(project.get("presupuesto_total"), 0)
    gasto = _to_number(project.get("gasto_ejecutado"), 0)
    avance = _to_number(project.get("avance_global_percent"), 0)

    return (
        f"Resumen rápido de {project.get('project_nombre') or 'tu proyecto'}:\n"
        f"- Presupuesto: {presupuesto:,.0f} COP\n"
        f"- Gasto ejecutado: {gasto:,.0f} COP\n"
        f"- Avance global: {avance:.1f}%\n"
        "Pregunta adicional sugerida: ¿quieres que detalle riesgos por fase o por insumo?"
    )


@app.post("/chat/messages")
def post_chat_messages(
    payload: ChatPostRequest,
    principal: Principal = Depends(resolve_principal),
):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío.")

    if len(message) > 3000:
        raise HTTPException(status_code=400, detail="El mensaje es demasiado largo (máx. 3000).")

    with get_conn() as conn:
        profile_id = _coerce_profile(conn, principal)
        _assert_project_access(conn, profile_id, payload.project_id)

        with conn.cursor() as cur:
            session = None
            if payload.session_id and not payload.new_session:
                cur.execute(
                    """
                    select id, title, created_at, updated_at
                    from project_chat_sessions
                    where id = %s and project_id = %s
                    limit 1
                    """,
                    (payload.session_id, payload.project_id),
                )
                session = cur.fetchone()

            if not session:
                title = f"Chat de proyecto {datetime.now().strftime('%Y-%m-%d')}"
                cur.execute(
                    """
                    insert into project_chat_sessions (project_id, created_by, title, last_message_at)
                    values (%s, %s, %s, %s)
                    returning id, title, created_at, updated_at
                    """,
                    (payload.project_id, profile_id, title, _now_iso()),
                )
                session = cur.fetchone()

            cur.execute(
                """
                insert into project_chat_messages (session_id, project_id, role, content, metadata)
                values (%s, %s, 'user', %s, '{}'::jsonb)
                returning id, session_id, project_id, role, content, metadata, created_at
                """,
                (session["id"], payload.project_id, message),
            )
            user_msg = cur.fetchone()

            cur.execute(
                """
                select project_nombre, presupuesto_total, gasto_ejecutado, avance_global_percent
                from management_report_data
                where project_id = %s
                limit 1
                """,
                (payload.project_id,),
            )
            summary = cur.fetchone()

            answer = _build_deterministic_answer(summary, message)

            cur.execute(
                """
                insert into project_chat_messages (session_id, project_id, role, content, metadata)
                values (%s, %s, 'assistant', %s, %s::jsonb)
                returning id, session_id, project_id, role, content, metadata, created_at
                """,
                (
                    session["id"],
                    payload.project_id,
                    answer,
                    '{"intent":"executive_summary","model":"deterministic"}',
                ),
            )
            assistant_msg = cur.fetchone()

            now_iso = _now_iso()
            cur.execute(
                """
                update project_chat_sessions
                set updated_at = %s, last_message_at = %s
                where id = %s
                """,
                (now_iso, now_iso, session["id"]),
            )

        conn.commit()

    return {
        "ok": True,
        "session": {
            "id": session["id"],
            "title": session.get("title"),
            "created_at": session.get("created_at"),
            "updated_at": _now_iso(),
        },
        "messages": [user_msg, assistant_msg],
        "assistant_message": assistant_msg,
        "model": "deterministic",
    }
