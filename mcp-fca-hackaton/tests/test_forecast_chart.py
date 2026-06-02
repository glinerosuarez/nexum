#!/usr/bin/env python3
"""Tests for forecast chart generation."""

import unittest

from domain.supply_price.forecast_chart import (
    generate_material_price_forecast_chart,
    render_project_budget_chart,
    render_supply_timeline_chart,
)


SAMPLE_FORECAST = {
    "success": True,
    "run_id": "run-123",
    "project_id": "proj-1",
    "budget_impact": {
        "total_budget_subtotal": 100000.0,
        "projected_subtotal": 110000.0,
        "estimated_indexed_delta_pct": 10.0,
    },
    "materials": [
        {
            "supply_id": "sup-1",
            "supply_name": "Concreto 3000 PSI",
            "precio_unitario_budget": 500.0,
        }
    ],
    "supplies": [
        {
            "supply_id": "sup-1",
            "supply_name": "Concreto 3000 PSI",
            "precio_unitario_budget": 500.0,
            "points": [
                {
                    "forecast_date": "2026-06-01",
                    "predicted_unit_price": 510.0,
                    "unit_price_index": 510.0,
                    "unit_price_index_lower": 505.0,
                    "unit_price_index_upper": 515.0,
                },
                {
                    "forecast_date": "2026-07-01",
                    "predicted_unit_price": 520.0,
                    "unit_price_index": 520.0,
                    "unit_price_index_lower": 512.0,
                    "unit_price_index_upper": 528.0,
                },
            ],
            "observations": [
                {"observed_at": "2026-04-01", "unit_price": 500.0},
            ],
        }
    ],
}


class TestForecastChartRender(unittest.TestCase):
    def test_supply_svg_contains_plan_and_forecast(self):
        svg = render_supply_timeline_chart(
            supply_name="Concreto",
            dates=["2026-06-01", "2026-07-01"],
            plan_values=[500.0, 500.0],
            forecast_values=[510.0, 520.0],
            lower=[505.0, 512.0],
            upper=[515.0, 528.0],
        )
        self.assertIn("<svg", svg)
        self.assertIn("Plan (budget)", svg)
        self.assertIn("Forecast", svg)

    def test_project_bar_svg(self):
        svg = render_project_budget_chart(
            project_label="Nexum",
            planned=100000,
            projected=110000,
        )
        self.assertIn("Plan", svg)
        self.assertIn("Forecast", svg)


class TestForecastChartFromPayload(unittest.TestCase):
    def test_generate_from_inline_forecast(self):
        result = generate_material_price_forecast_chart(
            "user-1",
            forecast_result=SAMPLE_FORECAST,
        )
        self.assertTrue(result["success"])
        self.assertEqual(result["chart_count"], 1)
        self.assertIn("svg", result["supply_charts"][0])
        self.assertIn("image_data_uri", result["supply_charts"][0])
        self.assertIn("data:image/svg+xml;base64,", result["supply_charts"][0]["image_data_uri"])
        self.assertEqual(result["project_chart"]["planned_subtotal"], 100000.0)
        self.assertEqual(len(result["supply_charts"][0]["series"]["plan"]), 2)


if __name__ == "__main__":
    unittest.main()
