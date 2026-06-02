"""Simple linear trend forecast for monthly price index series."""

from __future__ import annotations

import calendar
from datetime import date
from statistics import stdev
from typing import Any


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _linear_regression(xs: list[float], ys: list[float]) -> tuple[float, float]:
    n = len(xs)
    if n == 0:
        return 0.0, 0.0
    x_mean = sum(xs) / n
    y_mean = sum(ys) / n
    numerator = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(n))
    denominator = sum((xs[i] - x_mean) ** 2 for i in range(n))
    slope = numerator / denominator if denominator else 0.0
    intercept = y_mean - slope * x_mean
    return slope, intercept


def forecast_series(
    observations: list[dict[str, Any]],
    *,
    horizon_months: int = 6,
    min_points: int = 12,
) -> dict[str, Any]:
    """Forecast future index values using linear trend on historical observations."""
    if horizon_months < 1:
        return {"success": False, "error": "horizon_months must be >= 1"}

    points: list[tuple[date, float]] = []
    for obs in observations:
        try:
            obs_date = date.fromisoformat(str(obs["date"])[:10])
            value = float(obs["value"])
        except (KeyError, TypeError, ValueError):
            continue
        points.append((obs_date, value))

    points.sort(key=lambda item: item[0])
    if len(points) < min_points:
        return {
            "success": False,
            "error": (
                f"Insufficient history: need at least {min_points} points, "
                f"got {len(points)}."
            ),
            "point_count": len(points),
        }

    xs = [float(i) for i in range(len(points))]
    ys = [value for _, value in points]
    slope, intercept = _linear_regression(xs, ys)

    residuals = [ys[i] - (slope * xs[i] + intercept) for i in range(len(ys))]
    band = stdev(residuals) if len(residuals) > 1 else 0.0

    last_date, last_value = points[-1]
    forecast: list[dict[str, Any]] = []
    for step in range(1, horizon_months + 1):
        future_x = len(points) - 1 + step
        predicted = slope * future_x + intercept
        forecast_date = _add_months(last_date, step)
        forecast.append(
            {
                "date": forecast_date.isoformat(),
                "value": round(predicted, 4),
                "lower": round(predicted - band, 4),
                "upper": round(predicted + band, 4),
            }
        )

    pct_change = 0.0
    if last_value:
        end_value = forecast[-1]["value"]
        pct_change = round(((end_value - last_value) / last_value) * 100, 2)

    return {
        "success": True,
        "method": "linear_trend",
        "point_count": len(points),
        "last_observation": {
            "date": last_date.isoformat(),
            "value": round(last_value, 4),
        },
        "trend": {
            "slope_per_month": round(slope, 6),
            "residual_std": round(band, 4),
        },
        "horizon_months": horizon_months,
        "forecast": forecast,
        "forecast_pct_change": pct_change,
    }
