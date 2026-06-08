from __future__ import annotations

import unittest

from nexum_api.project_input_batches import bind_input_batch_to_project


class _RecordingCursor:
    def __init__(self, conn: "_RecordingConn") -> None:
        self._conn = conn

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params=None):
        self._conn.executed.append((" ".join(sql.split()), params))

    def fetchone(self):
        if self._conn.fetchone_rows:
            return self._conn.fetchone_rows.pop(0)
        return None


class _RecordingConn:
    def __init__(self, fetchone_rows: list[dict[str, object]]):
        self.fetchone_rows = list(fetchone_rows)
        self.executed: list[tuple[str, object]] = []

    def cursor(self):
        return _RecordingCursor(self)


class TestProjectInputBatchBinding(unittest.TestCase):
    def test_bind_project_propagates_to_shadow_rows(self):
        conn = _RecordingConn(
            [
                {
                    "id": "batch-1",
                    "created_by_profile_id": "profile-1",
                    "project_id": None,
                }
            ]
        )

        bind_input_batch_to_project(
            conn,
            created_by_profile_id="profile-1",
            input_batch_id="batch-1",
            project_id="project-1",
        )

        executed_sql = [sql for sql, _params in conn.executed]
        self.assertTrue(
            any("update project_input_batches" in sql for sql in executed_sql)
        )
        self.assertTrue(
            any("update project_input_agentic_runs" in sql for sql in executed_sql)
        )
        self.assertTrue(
            any("update project_input_agentic_candidates" in sql for sql in executed_sql)
        )


if __name__ == "__main__":
    unittest.main()
