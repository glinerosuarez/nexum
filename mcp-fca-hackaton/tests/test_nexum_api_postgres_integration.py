#!/usr/bin/env python3
"""Opt-in integration tests against a real Postgres schema for nexum-api."""

from __future__ import annotations

import os
import unittest
import uuid
from contextlib import contextmanager
from unittest.mock import patch

import psycopg
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from nexum_api.app import app, resolve_principal
from nexum_api.auth import Principal

TEST_DB_CONN = (os.getenv("NEXUM_TEST_DB_CONN") or "").strip()


def _require_test_db() -> str:
    if not TEST_DB_CONN:
        raise unittest.SkipTest(
            "Set NEXUM_TEST_DB_CONN to run real Postgres integration tests.",
        )
    return TEST_DB_CONN


@contextmanager
def _real_db_conn_ctx(conninfo: str):
    conn = psycopg.connect(conninfo, row_factory=dict_row)
    try:
        yield conn
    finally:
        conn.close()


def _cleanup_by_external_auth_id(conninfo: str, external_auth_id: str) -> None:
    with psycopg.connect(conninfo, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("select id from profiles where external_auth_id = %s", (external_auth_id,))
            profile = cur.fetchone()
            if not profile:
                conn.commit()
                return

            profile_id = profile["id"]

            cur.execute(
                "select project_id from project_memberships where profile_id = %s",
                (profile_id,),
            )
            project_ids = [row["project_id"] for row in cur.fetchall()]

            for project_id in project_ids:
                cur.execute("delete from projects where id = %s", (project_id,))

            cur.execute("delete from profiles where id = %s", (profile_id,))
        conn.commit()


def _table_exists(conninfo: str, table_name: str) -> bool:
    with psycopg.connect(conninfo, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("select to_regclass(%s) as name", (table_name,))
            row = cur.fetchone() or {}
        conn.commit()
    return bool(row.get("name"))


@unittest.skipUnless(TEST_DB_CONN, "Set NEXUM_TEST_DB_CONN for integration tests")
class TestNexumApiPostgresIntegration(unittest.TestCase):
    def setUp(self):
        self.conninfo = _require_test_db()
        self.firebase_uid = f"it-firebase-{uuid.uuid4()}"

        app.dependency_overrides[resolve_principal] = lambda: Principal(
            uid=self.firebase_uid,
            email=f"{self.firebase_uid}@example.com",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        _cleanup_by_external_auth_id(self.conninfo, self.firebase_uid)

    def test_create_project_persists_bootstrap_rows(self):
        payload = {
            "nombre": f"IT Proyecto {uuid.uuid4()}",
            "descripcion": "integration test project",
            "ubicacion": "Bogota",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-01-10",
            "fecha_fin_planeada": "2026-12-01",
            "fecha_inicio_real": "2026-01-15",
            "presupuesto_total": 98000000,
            "phases": [
                {
                    "nombre": "Planeacion",
                    "sort_order": 1,
                    "fecha_inicio": "2026-01-10",
                    "fecha_fin": "2026-03-10",
                    "porcentaje_completado": 20,
                    "costo": 18000000,
                },
                {
                    "nombre": "Ejecucion",
                    "sort_order": 2,
                    "fecha_inicio": "2026-03-11",
                    "fecha_fin": "2026-12-01",
                    "porcentaje_completado": 5,
                    "costo": 80000000,
                },
            ],
        }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _real_db_conn_ctx(self.conninfo)):
            response = self.client.post("/projects", json=payload)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body.get("ok"))
        project_id = body.get("project_id")
        self.assertTrue(project_id)

        with psycopg.connect(self.conninfo, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute("select id, nombre from projects where id = %s", (project_id,))
                project = cur.fetchone()
                self.assertIsNotNone(project)

                cur.execute(
                    "select count(*) as c from project_memberships where project_id = %s",
                    (project_id,),
                )
                self.assertGreaterEqual(int((cur.fetchone() or {}).get("c", 0)), 1)

                cur.execute(
                    "select count(*) as c from project_phases where project_id = %s",
                    (project_id,),
                )
                self.assertGreaterEqual(int((cur.fetchone() or {}).get("c", 0)), 2)

                cur.execute(
                    """
                    select count(*) as c
                    from activities a
                    join project_phases ph on ph.id = a.phase_id
                    where ph.project_id = %s
                    """,
                    (project_id,),
                )
                self.assertGreaterEqual(int((cur.fetchone() or {}).get("c", 0)), 2)

                cur.execute(
                    """
                    select count(*) as c
                    from activity_supplies aps
                    join activities a on a.id = aps.activity_id
                    join project_phases ph on ph.id = a.phase_id
                    where ph.project_id = %s
                    """,
                    (project_id,),
                )
                self.assertGreaterEqual(int((cur.fetchone() or {}).get("c", 0)), 1)

                cur.execute(
                    "select count(*) as c from budget_snapshots where project_id = %s",
                    (project_id,),
                )
                self.assertGreaterEqual(int((cur.fetchone() or {}).get("c", 0)), 1)

    def test_dashboard_summary_for_created_project(self):
        payload = {
            "nombre": f"IT Dashboard {uuid.uuid4()}",
            "descripcion": "integration dashboard project",
            "ubicacion": "Medellin",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-02-01",
            "fecha_fin_planeada": "2026-10-30",
            "fecha_inicio_real": "2026-02-03",
            "presupuesto_total": 50000000,
            "phases": [
                {
                    "nombre": "Fase Unica",
                    "sort_order": 1,
                    "fecha_inicio": "2026-02-01",
                    "fecha_fin": "2026-10-30",
                    "porcentaje_completado": 12,
                    "costo": 50000000,
                }
            ],
        }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _real_db_conn_ctx(self.conninfo)):
            create_res = self.client.post("/projects", json=payload)
            self.assertEqual(create_res.status_code, 200)
            project_id = create_res.json().get("project_id")
            self.assertTrue(project_id)

            summary_res = self.client.get(f"/dashboard/summary?project_id={project_id}")

        self.assertEqual(summary_res.status_code, 200)
        summary = summary_res.json()
        self.assertEqual(summary.get("project", {}).get("id"), project_id)

        totals = summary.get("totals", {})
        for key in [
            "presupuesto_total",
            "gasto_ejecutado",
            "avance",
            "incidentes_abiertos",
            "insumos_criticos_alerta",
            "exposicion_critica",
            "ordenes_prioritarias",
            "saldo_por_pagar",
            "nomina_pagada",
        ]:
            self.assertIn(key, totals)

    def test_project_costs_shape_for_created_project(self):
        payload = {
            "nombre": f"IT Costs {uuid.uuid4()}",
            "descripcion": "integration costs project",
            "ubicacion": "Cali",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-03-01",
            "fecha_fin_planeada": "2026-12-15",
            "fecha_inicio_real": "2026-03-02",
            "presupuesto_total": 42000000,
            "phases": [
                {
                    "nombre": "Fase Costos",
                    "sort_order": 1,
                    "fecha_inicio": "2026-03-01",
                    "fecha_fin": "2026-12-15",
                    "porcentaje_completado": 8,
                    "costo": 42000000,
                }
            ],
        }

        with patch("nexum_api.app.get_conn", side_effect=lambda: _real_db_conn_ctx(self.conninfo)):
            create_res = self.client.post("/projects", json=payload)
            self.assertEqual(create_res.status_code, 200)
            project_id = create_res.json().get("project_id")
            self.assertTrue(project_id)

            costs_res = self.client.get(f"/projects/{project_id}/costs")

        self.assertEqual(costs_res.status_code, 200)
        costs = costs_res.json()
        self.assertIn("project", costs)
        self.assertIn("budgetByPhase", costs)
        self.assertIn("purchaseOrders", costs)
        self.assertIn("nominaTotal", costs)
        self.assertIn("pagosProveedores", costs)
        self.assertIn("pagosPendientes", costs)
        self.assertIn("ordenesPrioritarias", costs)
        self.assertIn("gastoPorCategoria", costs)

    def test_supply_agent_run_persists_lifecycle_on_success(self):
        if not _table_exists(self.conninfo, "supply_agent_runs"):
            self.skipTest("supply_agent_runs table is missing in NEXUM_TEST_DB_CONN.")

        payload = {
            "nombre": f"IT Agent Success {uuid.uuid4()}",
            "descripcion": "integration supply agent success",
            "ubicacion": "Bogota",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-04-01",
            "fecha_fin_planeada": "2026-11-30",
            "fecha_inicio_real": "2026-04-05",
            "presupuesto_total": 35000000,
            "phases": [
                {
                    "nombre": "Fase Agent",
                    "sort_order": 1,
                    "fecha_inicio": "2026-04-01",
                    "fecha_fin": "2026-11-30",
                    "porcentaje_completado": 15,
                    "costo": 35000000,
                }
            ],
        }
        run_id = str(uuid.uuid4())

        with patch("nexum_api.app.get_conn", side_effect=lambda: _real_db_conn_ctx(self.conninfo)):
            create_res = self.client.post("/projects", json=payload)
            self.assertEqual(create_res.status_code, 200)
            project_id = create_res.json().get("project_id")
            self.assertTrue(project_id)

            with patch(
                "nexum_api.app._run_mcp_tool",
                return_value={
                    "success": True,
                    "run": {
                        "id": run_id,
                        "status": "completed",
                        "counters": {
                            "supplies_requested": 3,
                            "supplies_processed": 2,
                            "errors": 1,
                            "forecasts_written": 8,
                            "alerts_created": 1,
                        },
                    },
                },
            ):
                run_res = self.client.post(
                    "/agent/run-supply-cost",
                    json={"project_id": project_id, "mode": "manual"},
                    headers={"x-run-id": run_id},
                )

        self.assertEqual(run_res.status_code, 200)
        run_payload = run_res.json()
        self.assertTrue(run_payload.get("ok"))
        self.assertEqual(run_payload.get("run_id"), run_id)
        self.assertEqual(run_payload.get("supplies_scraped_ok"), 2)
        self.assertEqual(run_payload.get("supplies_scraped_failed"), 1)
        self.assertEqual(run_payload.get("forecast_points_written"), 8)
        self.assertEqual(run_payload.get("alerts_triggered"), 1)

        with psycopg.connect(self.conninfo, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select id, status, error_summary, metadata from supply_agent_runs where id = %s",
                    (run_id,),
                )
                row = cur.fetchone()
            conn.commit()

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["status"], "completed")
        self.assertIsNone(row.get("error_summary"))
        metadata = row.get("metadata") or {}
        lifecycle = metadata.get("lifecycle") or {}
        self.assertEqual(lifecycle.get("stage"), "completed")
        self.assertEqual(lifecycle.get("status"), "completed")
        stages = [entry.get("stage") for entry in (lifecycle.get("history") or [])]
        for expected in [
            "accepted",
            "selecting_targets",
            "fetching_market_data",
            "forecasting",
            "computing_risk",
            "persisting",
            "completed",
        ]:
            self.assertIn(expected, stages)
        counters = metadata.get("counters") or {}
        self.assertEqual(int(counters.get("supplies_processed", 0)), 2)
        self.assertEqual(int(counters.get("errors", 0)), 1)
        self.assertEqual(int(counters.get("forecasts_written", 0)), 8)
        self.assertEqual(int(counters.get("alerts_created", 0)), 1)

    def test_supply_agent_run_persists_failed_state_on_mcp_error(self):
        if not _table_exists(self.conninfo, "supply_agent_runs"):
            self.skipTest("supply_agent_runs table is missing in NEXUM_TEST_DB_CONN.")

        payload = {
            "nombre": f"IT Agent Failed {uuid.uuid4()}",
            "descripcion": "integration supply agent fail",
            "ubicacion": "Bogota",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-04-01",
            "fecha_fin_planeada": "2026-11-30",
            "fecha_inicio_real": "2026-04-05",
            "presupuesto_total": 35000000,
            "phases": [
                {
                    "nombre": "Fase Agent",
                    "sort_order": 1,
                    "fecha_inicio": "2026-04-01",
                    "fecha_fin": "2026-11-30",
                    "porcentaje_completado": 15,
                    "costo": 35000000,
                }
            ],
        }
        run_id = str(uuid.uuid4())

        with patch("nexum_api.app.get_conn", side_effect=lambda: _real_db_conn_ctx(self.conninfo)):
            create_res = self.client.post("/projects", json=payload)
            self.assertEqual(create_res.status_code, 200)
            project_id = create_res.json().get("project_id")
            self.assertTrue(project_id)

            with patch(
                "nexum_api.app._run_mcp_tool",
                side_effect=RuntimeError("transport unavailable"),
            ):
                run_res = self.client.post(
                    "/agent/run-supply-cost",
                    json={"project_id": project_id, "mode": "manual"},
                    headers={"x-run-id": run_id},
                )

        self.assertEqual(run_res.status_code, 502)
        run_payload = run_res.json()
        self.assertFalse(run_payload.get("ok"))
        self.assertEqual(run_payload.get("error_class"), "remote_mcp_failed")
        self.assertEqual(run_payload.get("run_id"), run_id)

        with psycopg.connect(self.conninfo, row_factory=dict_row) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select id, status, error_summary, metadata from supply_agent_runs where id = %s",
                    (run_id,),
                )
                row = cur.fetchone()
            conn.commit()

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row["status"], "failed")
        self.assertIn("transport unavailable", str(row.get("error_summary") or ""))
        metadata = row.get("metadata") or {}
        lifecycle = metadata.get("lifecycle") or {}
        self.assertEqual(lifecycle.get("stage"), "failed")
        self.assertEqual(lifecycle.get("status"), "failed")
        diagnostics = metadata.get("diagnostics") or {}
        self.assertEqual(diagnostics.get("error_class"), "remote_mcp_failed")
        self.assertIn("transport unavailable", str(diagnostics.get("error_summary") or ""))


if __name__ == "__main__":
    unittest.main()
