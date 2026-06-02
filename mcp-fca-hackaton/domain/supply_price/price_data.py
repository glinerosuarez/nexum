"""Fetch historical construction-material price indices from public sources."""

from __future__ import annotations

import csv
import io
import logging
import os
import re
import time
from datetime import date, timedelta
from typing import Any

import httpx

logger = logging.getLogger("mcp-price-data")

FRED_API_BASE = "https://api.stlouisfed.org/fred/series/observations"
FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv"

# US PPI series used as market proxies (documented in tool responses).
SERIES_CATALOG: list[dict[str, Any]] = [
    {
        "key": "cement",
        "keywords": (
            "cemento",
            "cement",
            "portland",
            "hormigon",
            "hormigón",
            "concreto",
            "concrete",
        ),
        "fred_series_id": "WPU0573",
        "label": "PPI: Cement (US market proxy)",
        "unit": "index",
    },
    {
        "key": "steel",
        "keywords": (
            "acero",
            "steel",
            "varilla",
            "rebar",
            "hierro",
            "iron",
            "armadura",
        ),
        "fred_series_id": "WPU101707",
        "label": "PPI: Iron and steel (US market proxy)",
        "unit": "index",
    },
    {
        "key": "lumber",
        "keywords": ("madera", "lumber", "wood", "timber", "tablero"),
        "fred_series_id": "WPU0811",
        "label": "PPI: Lumber and wood products (US market proxy)",
        "unit": "index",
    },
    {
        "key": "diesel",
        "keywords": ("diesel", "combustible", "fuel", "gasoil", "energia", "energy"),
        "fred_series_id": "WPU057303",
        "label": "PPI: Diesel fuel (US market proxy)",
        "unit": "index",
    },
]

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL_SECONDS = 3600


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def resolve_supply_to_series(supply_name: str) -> dict[str, Any] | None:
    """Map a supply catalog name to a configured external price series."""
    needle = _normalize_text(supply_name)
    if not needle:
        return None

    best: dict[str, Any] | None = None
    best_len = 0
    for entry in SERIES_CATALOG:
        for keyword in entry["keywords"]:
            key_norm = _normalize_text(keyword)
            if key_norm in needle or needle in key_norm:
                if len(key_norm) >= best_len:
                    best = entry
                    best_len = len(key_norm)
    return best


def _parse_fred_csv(text: str, series_id: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    observations: list[dict[str, Any]] = []
    for row in reader:
        raw_date = row.get("DATE") or row.get("observation_date")
        raw_value = row.get(series_id) or row.get("VALUE")
        if not raw_date or raw_value in (None, "", "."):
            continue
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        observations.append({"date": raw_date, "value": value})
    observations.sort(key=lambda item: item["date"])
    return observations


def _trim_observations(
    observations: list[dict[str, Any]], history_months: int
) -> list[dict[str, Any]]:
    if not observations:
        return observations
    try:
        last = date.fromisoformat(observations[-1]["date"][:10])
    except ValueError:
        return observations[-history_months:]
    cutoff = last - timedelta(days=history_months * 31)
    return [
        obs
        for obs in observations
        if date.fromisoformat(obs["date"][:10]) >= cutoff
    ]


def _fetch_fred_api(
    series_id: str, api_key: str, history_months: int
) -> list[dict[str, Any]]:
    start = (date.today() - timedelta(days=history_months * 31)).isoformat()
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start,
    }
    with httpx.Client(timeout=20.0) as client:
        response = client.get(FRED_API_BASE, params=params)
        response.raise_for_status()
        payload = response.json()

    observations: list[dict[str, Any]] = []
    for row in payload.get("observations", []):
        raw_value = row.get("value")
        if raw_value in (None, "", "."):
            continue
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        observations.append({"date": row["date"], "value": value})
    observations.sort(key=lambda item: item["date"])
    return observations


def _fetch_fred_csv(series_id: str, history_months: int) -> list[dict[str, Any]]:
    params = {"id": series_id, "cos": "min", "mode": "fred"}
    with httpx.Client(timeout=25.0, follow_redirects=True) as client:
        response = client.get(FRED_CSV_BASE, params=params)
        response.raise_for_status()
        observations = _parse_fred_csv(response.text, series_id)
    return _trim_observations(observations, history_months)


def fetch_from_source(
    source_row: dict[str, Any],
    *,
    history_months: int = 36,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Fetch historical prices using a supply_price_sources row."""
    cfg = source_row.get("parse_config") or {}
    provider = cfg.get("provider", "fred")
    if provider == "fred":
        series_id = cfg.get("series_id")
        if not series_id:
            return {
                "success": False,
                "error": "parse_config.series_id missing for FRED source.",
            }
        result = fetch_historical_prices(
            series_id, history_months=history_months, use_cache=use_cache
        )
        if result.get("success"):
            result["source_id"] = source_row.get("id")
            result["source_key"] = source_row.get("source_key")
            result["label"] = cfg.get("label") or source_row.get("source_key")
        return result
    return {
        "success": False,
        "error": f"Unsupported price source provider: {provider}",
    }


def series_entry_to_virtual_source(series: dict[str, Any]) -> dict[str, Any]:
    """Build a virtual supply_price_sources-shaped dict from SERIES_CATALOG."""
    series_id = series["fred_series_id"]
    return {
        "id": None,
        "source_key": f"fred_{series['key']}",
        "source_type": "api",
        "url": f"https://fred.stlouisfed.org/series/{series_id}",
        "parse_config": {
            "provider": "fred",
            "series_id": series_id,
            "series_key": series["key"],
            "label": series["label"],
        },
        "region": "US",
        "currency": "USD",
        "price_unit": series.get("unit", "index"),
        "is_index": True,
    }


def fetch_historical_prices(
    series_id: str,
    *,
    history_months: int = 36,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Return historical index observations for a FRED series."""
    cache_key = f"{series_id}:{history_months}"
    if use_cache and cache_key in _CACHE:
        cached_at, cached_data = _CACHE[cache_key]
        if time.time() - cached_at < _CACHE_TTL_SECONDS:
            return {
                "success": True,
                "series_id": series_id,
                "source": "fred_cache",
                "count": len(cached_data),
                "observations": cached_data,
            }

    api_key = os.environ.get("FRED_API_KEY", "").strip()
    observations: list[dict[str, Any]] = []
    source = "fred_csv"

    try:
        if api_key:
            observations = _fetch_fred_api(series_id, api_key, history_months)
            source = "fred_api"
        else:
            observations = _fetch_fred_csv(series_id, history_months)
    except httpx.HTTPError as exc:
        logger.error("FRED fetch failed for %s: %s", series_id, exc)
        return {
            "success": False,
            "series_id": series_id,
            "error": f"Failed to fetch price series {series_id}: {exc}",
        }

    if not observations:
        return {
            "success": False,
            "series_id": series_id,
            "error": f"No observations returned for series {series_id}.",
        }

    if use_cache:
        _CACHE[cache_key] = (time.time(), observations)

    return {
        "success": True,
        "series_id": series_id,
        "source": source,
        "count": len(observations),
        "observations": observations,
    }
