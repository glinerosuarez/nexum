#!/usr/bin/env python3
"""Tests for nexum-api onboarding create flow."""

from __future__ import annotations

import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient

from nexum_api.app import app, resolve_principal
from nexum_api.auth import Principal
from nexum_api.db import DbConfigError
from nexum_api.onboarding import create_project_with_bootstrap


class _DummyConn:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True


@contextmanager
def _dummy_conn_ctx(conn: _DummyConn):
    yield conn


class _FakeCursor:
    def __init__(self) -> None:
        self._fetchone = None
        self._fetchall = []
        self._phase_insert_count = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=None):
        normalized = " ".join(sql.strip().lower().split())
        if normalized.startswith("insert into projects"):
            self._fetchone = {"id": "project-created-1"}
            return

        if normalized.startswith("insert into project_phases"):
            self._phase_insert_count += 1
            self._fetchone = {
                "id": f"phase-{self._phase_insert_count}",
                "nombre": params[1],
                "sort_order": params[3],
                "costo_planeado": params[6],
                "porcentaje_completado": params[8],
            }
            return

        self._fetchone = None

    def fetchone(self):
        return self._fetchone

    def fetchall(self):
        return self._fetchall


class _FakeConnForOnboarding:
    def __init__(self) -> None:
        self._cursor = _FakeCursor()

    def cursor(self):
        return self._cursor


class TestNexumApiProjectCreateEndpoint(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[resolve_principal] = lambda: Principal(
            uid="firebase-user-1",
            email="demo@example.com",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_create_project_success(self):
        conn = _DummyConn()
        payload = {
            "nombre": "Proyecto Test API",
            "descripcion": "desc",
            "ubicacion": "Bogota",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-01-10",
            "fecha_fin_planeada": "2026-11-30",
            "fecha_inicio_real": "2026-01-15",
            "presupuesto_total": 12345,
            "phases": [
                {
                    "nombre": "Fase A",
                    "sort_order": 1,
                    "fecha_inicio": "2026-01-10",
                    "fecha_fin": "2026-04-10",
                    "porcentaje_completado": 10,
                    "costo": 1000,
                }
            ],
        }

        with patch("nexum_api.app.get_conn", return_value=_dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch(
                    "nexum_api.app.create_project_with_bootstrap",
                    return_value="project-123",
                ) as create_mock:
                    response = self.client.post("/projects", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "project_id": "project-123"})
        self.assertTrue(conn.committed)
        create_mock.assert_called_once()

    def test_create_project_bootstrap_failure_returns_400(self):
        conn = _DummyConn()

        with patch("nexum_api.app.get_conn", return_value=_dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch(
                    "nexum_api.app.create_project_with_bootstrap",
                    side_effect=ValueError("El nombre del proyecto es obligatorio."),
                ):
                    response = self.client.post("/projects", json={"nombre": ""})

        self.assertEqual(response.status_code, 400)
        self.assertIn("obligatorio", response.json().get("detail", ""))

    def test_create_project_db_config_error_returns_500(self):
        with patch(
            "nexum_api.app.get_conn",
            side_effect=DbConfigError("DB_NAME, DB_USER and DB_PASS are required."),
        ):
            response = self.client.post("/projects", json={"nombre": "Proyecto"})

        self.assertEqual(response.status_code, 500)
        self.assertIn("DB_NAME", response.json().get("detail", ""))


class TestOnboardingUnit(unittest.TestCase):
    def test_create_project_with_bootstrap_calls_helpers_and_returns_project_id(self):
        conn = _FakeConnForOnboarding()
        payload = {
            "nombre": "Proyecto Unit",
            "descripcion": "desc",
            "ubicacion": "Medellin",
            "estado": "en_ejecucion",
            "fecha_inicio_planeada": "2026-01-10",
            "fecha_fin_planeada": "2026-09-30",
            "fecha_inicio_real": None,
            "presupuesto_total": 55000,
            "phases": [
                {
                    "nombre": "Planeacion",
                    "sort_order": 1,
                    "fecha_inicio": "2026-01-10",
                    "fecha_fin": "2026-02-15",
                    "porcentaje_completado": 30,
                    "costo": 10000,
                },
                {
                    "nombre": "Ejecucion",
                    "sort_order": 2,
                    "fecha_inicio": "2026-02-16",
                    "fecha_fin": "2026-09-30",
                    "porcentaje_completado": 5,
                    "costo": 45000,
                },
            ],
        }

        with patch("nexum_api.onboarding._ensure_demo_project_memberships") as memberships_mock:
            with patch("nexum_api.onboarding._bootstrap_activities_supplies_and_snapshot") as bootstrap_mock:
                project_id = create_project_with_bootstrap(
                    conn,
                    creator_profile_id="profile-creator-1",
                    payload=payload,
                )

        self.assertEqual(project_id, "project-created-1")
        memberships_mock.assert_called_once_with(conn, "project-created-1", "profile-creator-1")
        bootstrap_mock.assert_called_once()

    def test_create_project_with_bootstrap_requires_project_name(self):
        conn = _FakeConnForOnboarding()
        with self.assertRaises(ValueError):
            create_project_with_bootstrap(
                conn,
                creator_profile_id="profile-creator-1",
                payload={"nombre": "   "},
            )


if __name__ == "__main__":
    unittest.main()
