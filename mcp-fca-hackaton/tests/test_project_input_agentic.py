from __future__ import annotations

import unittest
from contextlib import contextmanager
from unittest.mock import patch

from fastapi.testclient import TestClient

from nexum_api.app import app, resolve_principal
from nexum_api.auth import Principal
from nexum_api.project_input_agentic import _infer_judgment


class _DummyConn:
    def __init__(self) -> None:
        self.committed = False

    def commit(self) -> None:
        self.committed = True

    def cursor(self):
        return _DummyCursor()


class _DummyCursor:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=None):
        return None

    def fetchone(self):
        return None


@contextmanager
def _dummy_conn_ctx(conn: _DummyConn):
    yield conn


class TestAgenticShadowQualification(unittest.TestCase):
    def test_heading_candidate_rejected(self):
        judgment = _infer_judgment(
            {
                "raw_text": "HABITACIONES Y PASILLOS",
                "raw_name": "HABITACIONES Y PASILLOS",
                "raw_unit": None,
                "raw_quantity": None,
                "raw_total_price": None,
                "section_labels": ["ARQUITECTURA"],
                "evidence_refs": [],
            }
        )
        self.assertEqual(judgment["judgment_label"], "heading_or_chapter")
        self.assertFalse(judgment["is_qualified"])
        self.assertFalse(judgment["is_market_monitorable"])

    def test_bundle_candidate_rejected(self):
        judgment = _infer_judgment(
            {
                "raw_text": "S/I tablero electrico bifasico con capacidad para 12 circuitos",
                "raw_name": "S/I tablero electrico bifasico con capacidad para 12 circuitos",
                "raw_unit": "und",
                "raw_quantity": 2,
                "raw_total_price": 13900000,
                "section_labels": ["INSTALACIONES ELECTRICAS"],
                "evidence_refs": [],
            }
        )
        self.assertEqual(judgment["judgment_label"], "bundle_or_mixed_scope")
        self.assertFalse(judgment["is_qualified"])
        self.assertFalse(judgment["is_market_monitorable"])

    def test_material_candidate_qualified(self):
        judgment = _infer_judgment(
            {
                "raw_text": "Acero corrugado #5",
                "raw_name": "Acero corrugado #5",
                "raw_unit": "kg",
                "raw_quantity": 100,
                "raw_total_price": 520000,
                "section_labels": ["ESTRUCTURA"],
                "evidence_refs": [],
            }
        )
        self.assertEqual(judgment["judgment_label"], "qualified_supply")
        self.assertTrue(judgment["is_qualified"])
        self.assertTrue(judgment["is_market_monitorable"])


class TestAgenticShadowEndpoints(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[resolve_principal] = lambda: Principal(
            uid="firebase-user-1",
            email="demo@example.com",
        )
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_create_shadow_run_route(self):
        conn = _DummyConn()
        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch(
                    "nexum_api.app.create_agentic_shadow_run",
                    return_value={
                        "agentic_run_id": "run-1",
                        "input_batch_id": "batch-1",
                        "project_id": "project-1",
                        "candidate_count": 2,
                        "candidate_origin_counts": {
                            "matched_deterministic_candidate": 1,
                            "agentic_only_candidate": 1,
                        },
                    },
                ):
                    response = self.client.post(
                        "/project-input-batches/batch-1/agentic-shadow-runs",
                        json={
                            "pipeline_variant": "agentic_shadow",
                            "candidates": [
                                {
                                    "shadow_candidate_id": "11111111-1111-1111-1111-111111111111",
                                    "input_batch_id": "batch-1",
                                    "document_id": "doc-1",
                                    "candidate_origin": "agentic_only_candidate",
                                    "source_type": "xlsx",
                                    "raw_text": "Acero corrugado #5",
                                    "raw_name": "Acero corrugado #5",
                                    "source_ref": {},
                                    "extraction_confidence": "medium",
                                }
                            ],
                        },
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["agentic_run_id"], "run-1")
        self.assertEqual(body["candidate_count"], 2)

    def test_qualify_shadow_run_route(self):
        conn = _DummyConn()
        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch(
                    "nexum_api.app.qualify_agentic_shadow_run",
                    return_value={
                        "agentic_run_id": "run-1",
                        "input_batch_id": "batch-1",
                        "project_id": "project-1",
                        "candidate_count": 10,
                        "qualified_supply_count": 4,
                        "rejected_candidate_count": 6,
                        "monitorable_supply_count": 3,
                        "judgment_counts": {"qualified_supply": 4, "heading_or_chapter": 6},
                    },
                ):
                    response = self.client.post(
                        "/project-input-batches/batch-1/agentic-shadow-runs/run-1/qualify",
                        json={},
                    )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["qualified_supply_count"], 4)
        self.assertEqual(body["rejected_candidate_count"], 6)

    def test_supply_selection_comparison_route(self):
        conn = _DummyConn()
        with patch("nexum_api.app.get_conn", side_effect=lambda: _dummy_conn_ctx(conn)):
            with patch("nexum_api.app._coerce_profile", return_value="profile-1"):
                with patch("nexum_api.app._assert_project_access"):
                    with patch(
                        "nexum_api.app.get_project_supply_selection_comparison",
                        return_value={
                            "input_batch_id": "batch-1",
                            "deterministic": {"row_counts": {"normalized_supply_count": 143}},
                            "agentic_shadow": {"summary": {"qualified_supply_count": 30}},
                            "comparison": {"qualified_supply_delta": -113},
                            "provenance": {"candidate_count": 35},
                        },
                    ):
                        response = self.client.get(
                            "/projects/project-1/supply-selection-comparison"
                        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["input_batch_id"], "batch-1")
        self.assertIn("agentic_shadow", body)


if __name__ == "__main__":
    unittest.main()
