#!/usr/bin/env python3
"""Seed supply_price_sources from FRED series catalog + supply_catalog keyword match."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domain.supply_price.price_data import resolve_supply_to_series
from infra.postgres_client import PostgresConfigError, get_conn, json_dumps


def build_source_row(supply: dict, series: dict) -> dict:
    series_id = series["fred_series_id"]
    source_name = f"fred_{series['key']}"
    return {
        "supply_id": supply["id"],
        "source_name": source_name,
        "source_url": f"https://fred.stlouisfed.org/series/{series_id}",
        "parse_config": {
            "provider": "fred",
            "series_id": series_id,
            "series_key": series["key"],
            "label": series["label"],
            "keywords": list(series["keywords"]),
            "price_unit": series.get("unit", "index"),
        },
        "priority": 1,
        "is_active": True,
    }


def upsert_source(row: dict) -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id
                from supply_price_sources
                where supply_id = %s and source_name = %s
                limit 1
                """,
                (row["supply_id"], row["source_name"]),
            )
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    """
                    update supply_price_sources
                    set
                      source_url = %s,
                      parse_config = %s::jsonb,
                      priority = %s,
                      is_active = %s,
                      updated_at = now()
                    where id = %s
                    """,
                    (
                        row["source_url"],
                        json_dumps(row["parse_config"]),
                        row["priority"],
                        row["is_active"],
                        existing["id"],
                    ),
                )
            else:
                cur.execute(
                    """
                    insert into supply_price_sources (
                      supply_id, source_name, source_url, parse_config, priority, is_active
                    )
                    values (%s, %s, %s, %s::jsonb, %s, %s)
                    """,
                    (
                        row["supply_id"],
                        row["source_name"],
                        row["source_url"],
                        json_dumps(row["parse_config"]),
                        row["priority"],
                        row["is_active"],
                    ),
                )
        conn.commit()


def seed_sources(*, dry_run: bool = False) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select id, nombre, activo
                from supply_catalog
                where activo = true
                order by nombre asc
                """,
            )
            supplies = cur.fetchall()
        conn.commit()

    rows: list[dict] = []
    for supply in supplies:
        nombre = supply.get("nombre") or ""
        series = resolve_supply_to_series(nombre)
        if not series:
            continue
        rows.append(build_source_row(supply, series))

    if not rows:
        print("No matching supplies found in supply_catalog.")
        return 0

    print(f"Matched {len(rows)} supply/source pairs:")
    for row in rows:
        label = row["parse_config"]["label"]
        print(f"  - supply_id={row['supply_id']} -> {row['source_name']} ({label})")

    if dry_run:
        print("Dry run — no writes.")
        return len(rows)

    for row in rows:
        upsert_source(row)

    print(f"Upserted {len(rows)} rows into supply_price_sources.")
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print matches without writing to Cloud SQL",
    )
    args = parser.parse_args()

    try:
        seed_sources(dry_run=args.dry_run)
    except PostgresConfigError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Seed failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
