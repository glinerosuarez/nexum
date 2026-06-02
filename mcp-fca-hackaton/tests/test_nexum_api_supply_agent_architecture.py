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


if __name__ == "__main__":
    unittest.main()
