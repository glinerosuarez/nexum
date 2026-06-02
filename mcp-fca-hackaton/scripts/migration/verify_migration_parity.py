#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from typing import Protocol
from urllib import parse, request as urlrequest

import psycopg
from psycopg.rows import dict_row

CRITICAL_TABLES = [
    ("projects", ("projects",)),
    ("project_memberships", ("project_memberships",)),
    ("activities", ("activities",)),
    ("activity_supplies", ("activity_supplies",)),
    ("budget_snapshots", ("budget_snapshots",)),
    ("budget_snapshot_items", ("budget_snapshot_items", "budget_snapshot_lines")),
    ("supply_agent_runs", ("supply_agent_runs",)),
    ("agent_overrun_snapshot", ("agent_overrun_snapshot",)),
    ("project_chat_sessions", ("project_chat_sessions",)),
    ("project_chat_messages", ("project_chat_messages",)),
]

FK_CHECKS = [
    (
        "activity_supplies.activity_id -> activities.id",
        """
        select count(*) as broken
        from activity_supplies s
        left join activities a on a.id = s.activity_id
        where a.id is null
        """,
    ),
    (
        "activities.phase_id -> project_phases.id",
        """
        select count(*) as broken
        from activities a
        left join project_phases p on p.id = a.phase_id
        where p.id is null
        """,
    ),
    (
        "project_memberships.project_id -> projects.id",
        """
        select count(*) as broken
        from project_memberships pm
        left join projects p on p.id = pm.project_id
        where p.id is null
        """,
    ),
]

SAMPLE_QUERIES = [
    (
        "management_report_data_count",
        "select count(*) as value from management_report_data",
    ),
    (
        "agent_overrun_snapshot_count",
        "select count(*) as value from agent_overrun_snapshot",
    ),
]


@dataclass
class DbConnConfig:
    conninfo: str


@dataclass
class SupabaseSourceConfig:
    base_url: str
    anon_key: str


class SourceCounter(Protocol):
    def table_count(self, table_name: str) -> int: ...


def require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def build_conn(prefix: str) -> DbConnConfig:
    return DbConnConfig(conninfo=require_env(f"{prefix}_DB_CONN"))


def try_build_supabase_source(prefix: str) -> SupabaseSourceConfig | None:
    base_url = (os.getenv(f"{prefix}_SUPABASE_URL") or "").strip().rstrip("/")
    anon_key = (os.getenv(f"{prefix}_SUPABASE_ANON_KEY") or "").strip()
    if not base_url and not anon_key:
        return None
    if not base_url or not anon_key:
        raise RuntimeError(
            f"Both {prefix}_SUPABASE_URL and {prefix}_SUPABASE_ANON_KEY are required "
            "when using Supabase REST source mode.",
        )
    return SupabaseSourceConfig(base_url=base_url, anon_key=anon_key)


def fetch_one_value(conn: psycopg.Connection, sql: str) -> int:
    with conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone() or {}
    value = row.get("value")
    if value is None:
        value = row.get("count")
    if value is None:
        value = row.get("broken")
    return int(value or 0)


def table_count(conn: psycopg.Connection, table: str) -> int:
    return fetch_one_value(conn, f"select count(*) as value from {table}")


def table_exists(conn: psycopg.Connection, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            select 1
            from information_schema.tables
            where table_schema = 'public' and table_name = %s
            limit 1
            """,
            (table,),
        )
        return cur.fetchone() is not None


class DbSourceCounter:
    def __init__(self, conn: psycopg.Connection):
        self._conn = conn

    def table_count(self, table_name: str) -> int:
        return table_count(self._conn, table_name)


class SupabaseRestSourceCounter:
    def __init__(self, config: SupabaseSourceConfig):
        self._base_url = config.base_url
        self._anon_key = config.anon_key

    def table_count(self, table_name: str) -> int:
        query = parse.urlencode({"select": "*", "limit": "1"})
        url = f"{self._base_url}/rest/v1/{table_name}?{query}"
        req = urlrequest.Request(url=url, method="HEAD")
        req.add_header("apikey", self._anon_key)
        req.add_header("Authorization", f"Bearer {self._anon_key}")
        req.add_header("Prefer", "count=exact")
        req.add_header("Accept", "application/json")
        with urlrequest.urlopen(req, timeout=30) as res:
            content_range = res.headers.get("Content-Range", "")
        if "/" not in content_range:
            raise RuntimeError(
                f"Supabase REST missing Content-Range for table {table_name}. Got: {content_range!r}",
            )
        suffix = content_range.split("/")[-1].strip()
        if suffix == "*":
            raise RuntimeError(f"Supabase REST returned unknown count for table {table_name}.")
        return int(suffix)


def main() -> int:
    source_db = (os.getenv("SOURCE_DB_CONN") or "").strip()
    source_supabase = try_build_supabase_source("SOURCE")
    if not source_db and source_supabase is None:
        raise RuntimeError(
            "Provide SOURCE_DB_CONN or SOURCE_SUPABASE_URL + SOURCE_SUPABASE_ANON_KEY.",
        )

    target = build_conn("TARGET")
    target_conn = psycopg.connect(target.conninfo, row_factory=dict_row)
    source_conn = psycopg.connect(source_db, row_factory=dict_row) if source_db else None
    failures: list[str] = []

    try:
        if source_conn is not None:
            source_counter: SourceCounter = DbSourceCounter(source_conn)
            source_mode = "postgres"
        else:
            source_counter = SupabaseRestSourceCounter(source_supabase)  # type: ignore[arg-type]
            source_mode = "supabase_rest"

        print(f"== Source mode: {source_mode} ==")
        print("== Table count parity ==")
        for canonical_name, candidates in CRITICAL_TABLES:
            source_table = candidates[0]
            target_table = None
            for candidate in candidates:
                if table_exists(target_conn, candidate):
                    target_table = candidate
                    break

            if target_table is None:
                failures.append(
                    f"target missing table/view for {canonical_name} (candidates: {', '.join(candidates)})",
                )
                print(
                    f"{canonical_name}: source_table={source_table} target_table=<missing> -> MISMATCH",
                )
                continue

            src = source_counter.table_count(source_table)
            dst = table_count(target_conn, target_table)
            status = "OK" if src == dst else "MISMATCH"
            print(
                f"{canonical_name}: source[{source_table}]={src} target[{target_table}]={dst} -> {status}",
            )
            if src != dst:
                failures.append(
                    f"count mismatch for {canonical_name}: source[{source_table}]={src} target[{target_table}]={dst}",
                )

        print("\n== Target FK integrity ==")
        for label, sql in FK_CHECKS:
            broken = fetch_one_value(target_conn, sql)
            status = "OK" if broken == 0 else "BROKEN"
            print(f"{label}: broken={broken} -> {status}")
            if broken != 0:
                failures.append(f"fk integrity failed for {label}: broken={broken}")

        print("\n== Sample query parity ==")
        for label, sql in SAMPLE_QUERIES:
            if source_conn is not None:
                src = fetch_one_value(source_conn, sql)
            else:
                source_table = (
                    "management_report_data"
                    if label == "management_report_data_count"
                    else "agent_overrun_snapshot"
                )
                src = source_counter.table_count(source_table)

            dst = fetch_one_value(target_conn, sql)
            status = "OK" if src == dst else "MISMATCH"
            print(f"{label}: source={src} target={dst} -> {status}")
            if src != dst:
                failures.append(f"sample query mismatch for {label}: source={src} target={dst}")

    finally:
        if source_conn is not None:
            source_conn.close()
        target_conn.close()

    if failures:
        print("\nVerification failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("\nMigration verification passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
