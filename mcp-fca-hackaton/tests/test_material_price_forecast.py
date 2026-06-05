#!/usr/bin/env python3
"""Tests for material price forecast pipeline."""

import os
import unittest
from unittest.mock import patch

import httpx

from domain.supply_price.price_data import resolve_supply_to_series, _parse_fred_csv
from domain.supply_price.price_forecast import forecast_series


SAMPLE_CSV = """DATE,WPU0573
2023-01-01,100.0
2023-02-01,101.0
2023-03-01,102.0
2023-04-01,103.0
2023-05-01,104.0
2023-06-01,105.0
2023-07-01,106.0
2023-08-01,107.0
2023-09-01,108.0
2023-10-01,109.0
2023-11-01,110.0
2023-12-01,111.0
2024-01-01,112.0
"""


class TestMaterialMapping(unittest.TestCase):
    def test_resolve_cement(self):
        series = resolve_supply_to_series("Cemento Portland tipo I")
        self.assertIsNotNone(series)
        assert series is not None
        self.assertEqual(series["key"], "cement")

    def test_resolve_steel(self):
        series = resolve_supply_to_series("Varilla acero 12mm")
        self.assertIsNotNone(series)
        assert series is not None
        self.assertEqual(series["key"], "steel")

    def test_resolve_unknown(self):
        self.assertIsNone(resolve_supply_to_series("Tornillos varios"))


class TestFredCsvParse(unittest.TestCase):
    def test_parse_csv(self):
        rows = _parse_fred_csv(SAMPLE_CSV, "WPU0573")
        self.assertEqual(len(rows), 13)
        self.assertEqual(rows[-1]["value"], 112.0)


class TestForecast(unittest.TestCase):
    def test_linear_forecast(self):
        observations = _parse_fred_csv(SAMPLE_CSV, "WPU0573")
        result = forecast_series(observations, horizon_months=3, min_points=12)
        self.assertTrue(result["success"])
        self.assertEqual(len(result["forecast"]), 3)
        self.assertGreater(result["forecast_pct_change"], 0)


class TestMaterialPriceForecastIntegration(unittest.TestCase):
    def test_orchestration_with_mocks(self):
        import domain.supply_price.material_price_forecast as mpf

        budget = {
            "success": True,
            "project_id": "proj-1",
            "snapshot": {"id": "snap-1", "version_number": 1},
            "items": [
                {
                    "cantidad_planeada": 100,
                    "precio_unitario": 10,
                    "subtotal": 1000,
                    "activity_supplies": {
                        "supply_id": "sup-1",
                        "supply_catalog": {
                            "nombre": "Cemento Portland",
                            "unidad_medida": "kg",
                        },
                    },
                },
                {
                    "cantidad_planeada": 50,
                    "precio_unitario": 20,
                    "subtotal": 1000,
                    "activity_supplies": {
                        "supply_id": "sup-2",
                        "supply_catalog": {
                            "nombre": "Varilla acero 10mm",
                            "unidad_medida": "m",
                        },
                    },
                },
            ],
        }

        fake_history = {
            "success": True,
            "series_id": "WPU0573",
            "source": "test",
            "count": 13,
            "observations": _parse_fred_csv(SAMPLE_CSV, "WPU0573"),
        }

        with patch(
            "domain.supply_price.material_price_forecast.sb.get_project_budget_status",
            return_value=budget,
        ):
            with patch(
                "domain.supply_price.material_price_forecast.fetch_historical_prices",
                return_value=fake_history,
            ):
                with patch(
                    "domain.supply_price.material_price_forecast.store.check_tables_available",
                    return_value=False,
                ):
                    result = mpf.material_price_forecast(
                        "user-1",
                        "proj-1",
                        horizon_months=3,
                        persist=False,
                    )

        self.assertTrue(result["success"])
        self.assertEqual(result["material_count"], 2)
        self.assertEqual(len(result["series_forecasts"]), 2)
        self.assertGreater(result["budget_impact"]["total_budget_subtotal"], 0)

    def test_persists_selected_supplies_and_source_mappings(self):
        import domain.supply_price.material_price_forecast as mpf

        budget = {
            "success": True,
            "project_id": "proj-1",
            "snapshot": {"id": "snap-1", "version_number": 1},
            "items": [
                {
                    "cantidad_planeada": 100,
                    "precio_unitario": 10,
                    "subtotal": 1000,
                    "activity_supplies": {
                        "supply_id": "sup-1",
                        "supply_catalog": {
                            "nombre": "Cemento Portland",
                            "unidad_medida": "kg",
                        },
                    },
                }
            ],
        }

        fake_history = {
            "success": True,
            "series_id": "WPU0573",
            "source": "test",
            "count": 13,
            "observations": _parse_fred_csv(SAMPLE_CSV, "WPU0573"),
        }
        create_run_result = {
            "id": "run-1",
            "counters": {
                "supplies_requested": 0,
                "supplies_processed": 0,
                "sources_attempted": 0,
                "sources_succeeded": 0,
                "observations_written": 0,
                "forecasts_written": 0,
                "alerts_created": 0,
                "errors": 0,
            },
        }

        with patch(
            "domain.supply_price.material_price_forecast.sb.get_project_budget_status",
            return_value=budget,
        ), patch(
            "domain.supply_price.material_price_forecast.fetch_historical_prices",
            return_value=fake_history,
        ), patch(
            "domain.supply_price.material_price_forecast.store.check_tables_available",
            return_value=True,
        ), patch(
            "domain.supply_price.material_price_forecast.store.create_run",
            return_value=create_run_result,
        ) as create_run_mock, patch(
            "domain.supply_price.material_price_forecast.store.insert_observations",
            return_value=[],
        ), patch(
            "domain.supply_price.material_price_forecast.store.insert_forecasts",
            return_value=[],
        ), patch(
            "domain.supply_price.material_price_forecast.store.finalize_run",
            return_value="completed",
        ) as finalize_mock:
            result = mpf.material_price_forecast(
                "user-1",
                "proj-1",
                horizon_months=3,
                persist=True,
            )

        self.assertTrue(result["success"])
        _, create_kwargs = create_run_mock.call_args
        self.assertEqual(create_kwargs["selected_supplies"][0]["supply_id"], "sup-1")
        self.assertEqual(create_kwargs["selected_supplies"][0]["supply_name"], "Cemento Portland")
        _, finalize_kwargs = finalize_mock.call_args
        self.assertEqual(finalize_kwargs["source_mappings"][0]["supply_id"], "sup-1")
        self.assertEqual(finalize_kwargs["source_mappings"][0]["mapping_strategy"], "keyword_fallback")


class TestLiveFredFetch(unittest.TestCase):
    @unittest.skipUnless(
        os.environ.get("RUN_LIVE_PRICE_TESTS"),
        "Set RUN_LIVE_PRICE_TESTS=1 to hit FRED",
    )
    def test_live_cement_series(self):
        from domain.supply_price.price_data import fetch_historical_prices

        result = fetch_historical_prices("WPU0573", history_months=24, use_cache=False)
        self.assertTrue(result["success"])
        self.assertGreaterEqual(result["count"], 12)


class TestFredFetchFallbacks(unittest.TestCase):
    def test_falls_back_to_csv_when_api_fails(self):
        from domain.supply_price.price_data import fetch_historical_prices

        with patch.dict(os.environ, {"FRED_API_KEY": "test-key"}, clear=False), patch(
            "domain.supply_price.price_data._fetch_fred_api",
            side_effect=httpx.ReadTimeout("api timeout"),
        ), patch(
            "domain.supply_price.price_data._fetch_fred_csv",
            return_value=_parse_fred_csv(SAMPLE_CSV, "WPU0573"),
        ):
            result = fetch_historical_prices("WPU0573", history_months=24, use_cache=False)

        self.assertTrue(result["success"])
        self.assertEqual(result["source"], "fred_csv")

    def test_reports_combined_error_after_retries(self):
        from domain.supply_price.price_data import fetch_historical_prices

        with patch.dict(os.environ, {}, clear=False), patch(
            "domain.supply_price.price_data._fetch_fred_csv",
            side_effect=httpx.ReadTimeout("csv timeout"),
        ):
            result = fetch_historical_prices("WPU0573", history_months=24, use_cache=False)

        self.assertFalse(result["success"])
        self.assertIn("attempt 2/2 failed", result["error"])


if __name__ == "__main__":
    unittest.main()
