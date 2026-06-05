#!/usr/bin/env python3
"""Unit tests for Cloud SQL-backed supply price store."""

from __future__ import annotations

import json
import unittest
from contextlib import contextmanager
from unittest.mock import patch


class _FakeCursor:
    def __init__(self, fetchone_values=None, fetchall_values=None) -> None:
        self.fetchone_values = list(fetchone_values or [])
        self.fetchall_values = list(fetchall_values or [])
        self.executed: list[tuple[str, tuple | None]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=None):
        self.executed.append((" ".join(sql.strip().split()), params))

    def fetchone(self):
        if self.fetchone_values:
            return self.fetchone_values.pop(0)
        return None

    def fetchall(self):
        if self.fetchall_values:
            return self.fetchall_values.pop(0)
        return []


class _FakeConn:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor
        self.committed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True


@contextmanager
def _conn_ctx(conn: _FakeConn):
    yield conn


class TestSupplyPriceStore(unittest.TestCase):
    def test_create_run_inserts_cloud_sql_row(self):
        from domain.supply_price import supply_price_store as store

        cursor = _FakeCursor(
            fetchone_values=[
                None,
                {
                    "id": "run-1",
                    "project_id": "proj-1",
                    "status": "running",
                    "started_at": "2026-06-01T00:00:00+00:00",
                    "metadata": {"counters": {"supplies_requested": 0}},
                }
            ]
        )
        conn = _FakeConn(cursor)

        with patch("domain.supply_price.supply_price_store.get_conn", side_effect=lambda: _conn_ctx(conn)):
            result = store.create_run(
                run_id="run-1",
                project_id="proj-1",
                triggered_by="user-1",
                trigger="manual",
                horizon_months=6,
                history_months=36,
                overrun_threshold_pct=10.0,
            )

        self.assertEqual(result["id"], "run-1")
        self.assertTrue(conn.committed)
        self.assertTrue(any("insert into supply_agent_runs" in sql.lower() for sql, _ in cursor.executed))
        insert_sql, insert_params = next(
            (entry for entry in cursor.executed if "insert into supply_agent_runs" in entry[0].lower()),
        )
        self.assertIn("insert into supply_agent_runs", insert_sql.lower())
        metadata = json.loads(insert_params[4])
        self.assertEqual(metadata.get("selected_supplies"), [])

    def test_create_run_merges_selected_supplies_into_existing_row(self):
        from domain.supply_price import supply_price_store as store

        cursor = _FakeCursor(
            fetchone_values=[
                {
                    "id": "run-1",
                    "metadata": {
                        "trigger": "manual",
                        "counters": {"supplies_requested": 1},
                        "lifecycle": {"stage": "accepted", "status": "running", "history": []},
                    },
                }
            ]
        )
        conn = _FakeConn(cursor)

        with patch("domain.supply_price.supply_price_store.get_conn", side_effect=lambda: _conn_ctx(conn)):
            result = store.create_run(
                run_id="run-1",
                project_id="proj-1",
                triggered_by="user-1",
                trigger="manual",
                horizon_months=6,
                history_months=36,
                overrun_threshold_pct=10.0,
                selected_supplies=[{"supply_id": "sup-1", "supply_name": "Cemento"}],
            )

        self.assertEqual(result["id"], "run-1")
        _, update_params = next(
            (entry for entry in cursor.executed if "update supply_agent_runs set metadata" in entry[0].lower()),
        )
        metadata = json.loads(update_params[0])
        self.assertEqual(metadata.get("selected_supplies")[0]["supply_name"], "Cemento")

    def test_finalize_run_updates_status_and_metadata(self):
        from domain.supply_price import supply_price_store as store

        cursor = _FakeCursor(
            fetchone_values=[
                {
                    "metadata": {
                        "counters": {},
                        "selected_supplies": [{"supply_id": "sup-1", "supply_name": "Cemento"}],
                        "lifecycle": {
                            "stage": "selecting_targets",
                            "status": "running",
                            "history": [
                                {"stage": "accepted", "status": "running", "at": "2026-06-02T00:00:00+00:00"},
                                {"stage": "selecting_targets", "status": "running", "at": "2026-06-02T00:00:01+00:00"},
                            ],
                        },
                    }
                }
            ]
        )
        conn = _FakeConn(cursor)

        with patch("domain.supply_price.supply_price_store.get_conn", side_effect=lambda: _conn_ctx(conn)):
            status = store.finalize_run(
                "run-1",
                started_monotonic=0.0,
                counters={"supplies_processed": 0, "errors": 2},
                budget_summary={"total_budget_subtotal": 100},
                error_count=2,
                error_summary="2 supply error(s)",
                source_mappings=[{"supply_id": "sup-1", "source_name": "fred_cement"}],
                terminal_status="failed",
            )

        self.assertEqual(status, "failed")
        self.assertTrue(conn.committed)
        self.assertTrue(any("update supply_agent_runs" in sql.lower() for sql, _ in cursor.executed))
        _, update_params = next(
            (entry for entry in cursor.executed if "update supply_agent_runs" in entry[0].lower()),
        )
        metadata = json.loads(update_params[3])
        self.assertEqual(metadata.get("selected_supplies")[0]["supply_name"], "Cemento")
        self.assertEqual(metadata.get("source_mappings")[0]["source_name"], "fred_cement")
        lifecycle = metadata.get("lifecycle") or {}
        self.assertEqual(lifecycle.get("stage"), "failed")
        self.assertEqual(lifecycle.get("status"), "failed")
        stages = [entry.get("stage") for entry in (lifecycle.get("history") or [])]
        self.assertIn("failed", stages)

    def test_finalize_run_defaults_to_completed_even_with_supply_errors(self):
        from domain.supply_price import supply_price_store as store

        cursor = _FakeCursor(
            fetchone_values=[
                {
                    "metadata": {
                        "counters": {},
                        "selected_supplies": [{"supply_name": "Madera"}],
                    }
                }
            ]
        )
        conn = _FakeConn(cursor)

        with patch("domain.supply_price.supply_price_store.get_conn", side_effect=lambda: _conn_ctx(conn)):
            status = store.finalize_run(
                "run-2",
                started_monotonic=0.0,
                counters={"supplies_processed": 0, "errors": 3},
                budget_summary={"total_budget_subtotal": 50},
                error_count=3,
                error_summary="3 supply error(s)",
            )

        self.assertEqual(status, "completed")
        _, update_params = next(
            (entry for entry in cursor.executed if "update supply_agent_runs" in entry[0].lower()),
        )
        metadata = json.loads(update_params[3])
        lifecycle = metadata.get("lifecycle") or {}
        self.assertEqual(lifecycle.get("stage"), "completed")
        self.assertEqual(lifecycle.get("status"), "completed")

    def test_check_tables_available_returns_false_for_missing_tables(self):
        from domain.supply_price import supply_price_store as store

        @contextmanager
        def _broken_conn():
            raise RuntimeError('relation "supply_agent_runs" does not exist')
            yield

        with patch("domain.supply_price.supply_price_store.get_conn", side_effect=_broken_conn):
            self.assertFalse(store.check_tables_available())


if __name__ == "__main__":
    unittest.main()
