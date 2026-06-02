from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row


class PostgresConfigError(RuntimeError):
    pass


def _build_conninfo() -> str:
    db_name = (os.getenv("DB_NAME") or "").strip()
    db_user = (os.getenv("DB_USER") or "").strip()
    db_pass = (os.getenv("DB_PASS") or "").strip()

    if not db_name or not db_user or not db_pass:
        raise PostgresConfigError("DB_NAME, DB_USER and DB_PASS are required.")

    cloud_sql_instance = (os.getenv("CLOUD_SQL_INSTANCE") or "").strip()
    db_host = (os.getenv("DB_HOST") or "").strip()
    db_port = (os.getenv("DB_PORT") or "5432").strip()

    if cloud_sql_instance:
        host = f"/cloudsql/{cloud_sql_instance}"
        return f"dbname={db_name} user={db_user} password={db_pass} host={host}"

    if not db_host:
        raise PostgresConfigError(
            "Set CLOUD_SQL_INSTANCE for Unix socket, or DB_HOST/DB_PORT for TCP.",
        )

    return (
        f"dbname={db_name} user={db_user} password={db_pass} "
        f"host={db_host} port={db_port}"
    )


@contextmanager
def get_conn() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(_build_conninfo(), row_factory=dict_row)
    try:
        yield conn
    finally:
        conn.close()


def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)
