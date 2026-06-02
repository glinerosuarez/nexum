#!/usr/bin/env python3
"""Apply supply price agent SQL migration when DB_CONN is configured."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file",
        default="supabase/migrations/001_supply_price_agent.sql",
        help="Migration SQL file path",
    )
    args = parser.parse_args()

    db_url = os.environ.get("DB_CONN", "").strip()
    if not db_url:
        print(
            "Set DB_CONN (postgres connection string) to apply migrations.\n"
            "Otherwise run the SQL manually against Cloud SQL:\n"
            f"  {args.file}",
            file=sys.stderr,
        )
        return 1

    try:
        import psycopg
    except ImportError:
        print(
            "Install psycopg: uv add psycopg[binary] (dev dependency) "
            "or apply SQL manually against Cloud SQL.",
            file=sys.stderr,
        )
        return 1

    sql_path = Path(args.file)
    sql = sql_path.read_text(encoding="utf-8")
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    print(f"Applied migration: {sql_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
