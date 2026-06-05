#!/usr/bin/env python3
"""Tests for supply-agent architecture contract in nexum-api."""

from __future__ import annotations

import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from nexum_api.app import (
    _is_valid_stage_transition,
    app,
    resolve_principal,
)
from nexum_api.auth import Principal


class _DummyConn:
    def __init__(self, fallback_row=None) -> None:
        self.committed = False
        self.fallback_row = fallback_row

    def commit(self) -> None:
        self.committed = True

    def cursor(self):
        return _DummyCursor(self.fallback_row)


class _DummyCursor:
    def __init__(self, fallback_row=None) -> None:
        self._fallback_row = fallback_row

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=None):
        return None

    def fetchone(self):
        return self._fallback_row


@contextmanager
def _dummy_conn_ctx(conn: _DummyConn):
    yield conn


class TestSupplyAgentStageTransitions(unittest.TestCase):
    def test_forward_only_and_terminal_immutability(self):
        self.assertTrue(_is_valid_stage_transition(None, "accepted"))
        self.assertTrue(_is_valid_stage_transition("accepted", "selecting_targets"))
        self.assertTrue(_is_valid_stage_transition("selecting_targets", "forecasting"))
        self.assertTrue(_is_valid_stage_transition("persisting", "completed"))
        self.assertTrue(_is_valid_stage_transition("accepted", "failed"))

        self.assertFalse(_is_valid_stage_transition("forecasting", "selecting_targets"))
        self.assertFalse(_is_valid_stage_transition("completed", "failed"))
        self.assertFalse(_is_valid_stage_transition("failed", "completed"))


class TestSupplyAgentRunEndpointContract(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[resolve_principal] = lambda: Principal(
            uid="firebase-user-1",
            email="demo@example.com",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_success_returns_stable_contract(self):
        conn = _DummyConn()

        def transition_side_effect(
            _conn,
            *,
            run_id,
            target_stage,
            status,
            counters=None,
            diagnostics=None,
        ):
            return {
                "stage": target_stage,
                "status": status,
                "counters": counters or {},
                "diagnostics": diagnostics or {},
            }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._assert_project_access"):
                    with patch("nexum_api.app._create_run_context"):
                        with patch(
                            "nexum_api.app._persist_run_transition",
                            side_effect=transition_side_effect,
                        ):
                            with patch(
                                "nexum_api.app._run_mcp_tool",
                                return_value={
                                    "success": True,
                                    "run": {
                                        "id": "11111111-1111-1111-1111-111111111111",
                                        "status": "completed",
                                        "counters": {
                                            "supplies_processed": 4,
                                            "errors": 1,
                                            "forecasts_written": 9,
                                            "alerts_created": 2,
                                        },
                                    },
                                },
                            ) as mcp_mock:
                                response = self.client.post(
                                    "/agent/run-supply-cost",
                                    json={"project_id": "project-1", "mode": "manual"},
                                    headers={"x-run-id": "11111111-1111-1111-1111-111111111111"},
                                )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("phase"), "phase2_remote_mcp")
        self.assertEqual(body.get("run_id"), "11111111-1111-1111-1111-111111111111")
        self.assertEqual(body.get("supplies_scraped_ok"), 4)
        self.assertEqual(body.get("supplies_scraped_failed"), 1)
        self.assertEqual(body.get("forecast_points_written"), 9)
        self.assertEqual(body.get("alerts_triggered"), 2)

        _, kwargs = mcp_mock.call_args
        self.assertEqual(kwargs.get("run_id"), "11111111-1111-1111-1111-111111111111")

    def test_success_skips_stage_replay_when_mcp_already_completed_run(self):
        conn = _DummyConn()
        persisted_targets: list[str] = []

        def transition_side_effect(
            _conn,
            *,
            run_id,
            target_stage,
            status,
            counters=None,
            diagnostics=None,
        ):
            persisted_targets.append(target_stage)
            return {
                "stage": target_stage,
                "status": status,
                "counters": counters or {},
                "diagnostics": diagnostics or {},
            }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._assert_project_access"):
                    with patch("nexum_api.app._create_run_context"):
                        with patch(
                            "nexum_api.app._persist_run_transition",
                            side_effect=transition_side_effect,
                        ):
                            with patch(
                                "nexum_api.app._current_run_lifecycle",
                                return_value={"stage": "completed", "status": "completed"},
                            ):
                                with patch(
                                    "nexum_api.app._run_mcp_tool",
                                    return_value={
                                        "success": True,
                                        "run": {
                                            "id": "11111111-1111-1111-1111-111111111111",
                                            "status": "completed",
                                            "counters": {
                                                "supplies_processed": 2,
                                                "errors": 0,
                                                "forecasts_written": 6,
                                                "alerts_created": 0,
                                            },
                                        },
                                    },
                                ):
                                    response = self.client.post(
                                        "/agent/run-supply-cost",
                                        json={"project_id": "project-1", "mode": "manual"},
                                        headers={"x-run-id": "11111111-1111-1111-1111-111111111111"},
                                    )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(persisted_targets, ["selecting_targets"])
        body = response.json()
        self.assertTrue(body.get("ok"))
        self.assertEqual(body.get("run_id"), "11111111-1111-1111-1111-111111111111")
        self.assertEqual(body.get("forecast_points_written"), 6)

    def test_mcp_transport_failure_returns_explicit_error(self):
        conn = _DummyConn()

        def transition_side_effect(
            _conn,
            *,
            run_id,
            target_stage,
            status,
            counters=None,
            diagnostics=None,
        ):
            return {
                "stage": target_stage,
                "status": status,
                "counters": counters or {},
                "diagnostics": diagnostics or {},
            }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._assert_project_access"):
                    with patch("nexum_api.app._create_run_context"):
                        with patch(
                            "nexum_api.app._persist_run_transition",
                            side_effect=transition_side_effect,
                        ):
                            with patch(
                                "nexum_api.app._run_mcp_tool",
                                side_effect=RuntimeError("transport unavailable"),
                            ):
                                response = self.client.post(
                                    "/agent/run-supply-cost",
                                    json={"project_id": "project-1", "mode": "manual"},
                                )

        self.assertEqual(response.status_code, 502)
        body = response.json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("error_class"), "remote_mcp_failed")
        self.assertIn("remote_mcp_failed", body.get("detail", ""))

    def test_unauthorized_access_blocked_pre_execution(self):
        conn = _DummyConn()

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch(
                    "nexum_api.app._assert_project_access",
                    side_effect=HTTPException(status_code=403, detail="Unauthorized project access."),
                ):
                    with patch("nexum_api.app._run_mcp_tool") as mcp_mock:
                        response = self.client.post(
                            "/agent/run-supply-cost",
                            json={"project_id": "project-1", "mode": "manual"},
                        )

        self.assertEqual(response.status_code, 403)
        body = response.json()
        self.assertFalse(body.get("ok"))
        self.assertEqual(body.get("error_class"), "authz_failed")
        mcp_mock.assert_not_called()


class TestSupplyAgentSnapshotState(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[resolve_principal] = lambda: Principal(
            uid="firebase-user-1",
            email="demo@example.com",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_snapshot_not_started_when_no_runs(self):
        conn = _DummyConn(fallback_row=None)

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._assert_project_access"):
                    with patch("nexum_api.app._latest_agent_run", return_value=None):
                        response = self.client.get("/projects/project-1/agent-overrun-snapshot")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("state"), "not_started")
        self.assertIsNone(body.get("snapshot"))

    def test_snapshot_failed_state_exposes_error_summary(self):
        conn = _DummyConn(fallback_row=None)
        run_row = {
            "id": "22222222-2222-2222-2222-222222222222",
            "status": "failed",
            "started_at": "2026-05-31T00:00:00+00:00",
            "finished_at": "2026-05-31T00:01:00+00:00",
            "error_summary": "Remote MCP timed out",
            "metadata": {
                "trigger": "manual",
                "counters": {
                    "supplies_requested": 4,
                    "supplies_processed": 0,
                    "errors": 4,
                    "forecasts_written": 0,
                    "alerts_created": 0,
                },
                "budget_summary": {
                    "total_budget_subtotal": 100,
                    "projected_subtotal": 100,
                    "estimated_indexed_delta": 0,
                    "estimated_indexed_delta_pct": 0,
                },
            },
        }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._assert_project_access"):
                    with patch("nexum_api.app._latest_agent_run", return_value=run_row):
                        response = self.client.get("/projects/project-1/agent-overrun-snapshot")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body.get("state"), "failed")
        snapshot = body.get("snapshot") or {}
        self.assertEqual(snapshot.get("last_run_status"), "failed")
        self.assertEqual(snapshot.get("error_summary"), "Remote MCP timed out")


class TestDashboardSummaryUsesLatestRun(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[resolve_principal] = lambda: Principal(
            uid="firebase-user-1",
            email="demo@example.com",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_dashboard_prefers_latest_run_selected_supplies_over_seed_catalog(self):
        conn = _DummyConn()
        latest_run = {
            "id": "run-123",
            "started_at": "2026-06-03T17:02:21+00:00",
            "finished_at": "2026-06-03T17:04:24+00:00",
            "metadata": {
                "selected_supplies": [
                    {
                        "supply_name": "HABITACIONES Y PASILLOS",
                        "unidad_medida": "",
                        "cantidad_planeada": 1,
                        "precio_unitario_budget": 940000000,
                        "subtotal_budget": 940000000,
                        "normalized_supply_id": "norm-heading",
                    },
                    {
                        "supply_name": "Contractual Window Assembly",
                        "unidad_medida": "und",
                        "cantidad_planeada": 20,
                        "precio_unitario_budget": 500000,
                        "subtotal_budget": 10000000,
                        "normalized_supply_id": "norm-1",
                    },
                    {
                        "supply_name": "Contractual HVAC Line",
                        "unidad_medida": "ml",
                        "cantidad_planeada": 80,
                        "precio_unitario_budget": 250000,
                        "subtotal_budget": 20000000,
                        "normalized_supply_id": "norm-2",
                    },
                ],
                "source_mappings": [
                    {
                        "normalized_supply_id": "norm-heading",
                        "error_code": "no_price_source",
                        "error_message": "No active row in supply_price_sources and no keyword match.",
                    },
                    {
                        "normalized_supply_id": "norm-1",
                        "error_code": "no_price_source",
                        "error_message": "No active row in supply_price_sources and no keyword match.",
                    },
                    {
                        "normalized_supply_id": "norm-2",
                        "series_key": "steel",
                        "error_code": None,
                        "error_message": None,
                    },
                ],
            },
        }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._resolve_project_for_user", return_value="project-1"):
                    with patch(
                        "nexum_api.app._project_summary_row",
                        return_value={
                            "id": "project-1",
                            "nombre": "Proyecto",
                            "estado": "en_ejecucion",
                            "avance_global_percent": 10,
                            "avance_planeado_percent": 12,
                            "presupuesto_total": 50000000,
                            "gasto_ejecutado": 1000000,
                            "spi": 0.9,
                            "cpi": 1.1,
                            "incidentes_abiertos": 0,
                        },
                    ):
                        with patch(
                            "nexum_api.app._list_supplies_for_project",
                            return_value=[
                                {
                                    "id": "seed-1",
                                    "nombre": "Formaleta metalica",
                                    "tipo": "subcontrato",
                                    "unidad_medida": "m2",
                                    "precio_referencia": 42000,
                                    "precio_actual": 42000,
                                    "variacion_precio_abs": 0,
                                    "variacion_precio_pct": 0,
                                    "tiene_actualizacion_precio": False,
                                    "fecha_precio_actualizacion": None,
                                    "disponibilidad": "agotado",
                                    "es_critico": True,
                                    "exposicion_presupuestal": 999999999,
                                    "cantidad_planeada_total": 1,
                                    "cantidad_ejecutada_total": 0,
                                    "ordenes_pendientes": 0,
                                    "proyectos_impactados": 1,
                                }
                            ],
                        ):
                            with patch(
                                "nexum_api.app._project_alert_rows",
                                return_value=[
                                    {
                                        "alert_id": "seed-alert",
                                        "supply_id": "seed-1",
                                        "nombre": "Formaleta metalica",
                                        "tipo": "subcontrato",
                                        "disponibilidad": "agotado",
                                        "mensaje": "seed alert",
                                        "abierta_desde": "2026-06-01T00:00:00+00:00",
                                        "exposicion": 999999999,
                                    }
                                ],
                            ):
                                with patch("nexum_api.app._latest_agent_run", return_value=latest_run):
                                    with patch(
                                        "nexum_api.app._project_financial_totals",
                                        return_value={
                                            "ordenes_prioritarias": 0,
                                            "saldo_por_pagar": 0,
                                            "nomina_pagada": 0,
                                        },
                                    ):
                                        response = self.client.get("/dashboard/summary?project_id=project-1")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["topCriticalSupplies"][0]["nombre"], "Contractual HVAC Line")
        self.assertNotIn("HABITACIONES Y PASILLOS", [item["nombre"] for item in body["topCriticalSupplies"]])
        self.assertEqual(body["alerts"], [])
        self.assertEqual(body["totals"]["insumos_criticos_alerta"], 0)


if __name__ == "__main__":
    unittest.main()
