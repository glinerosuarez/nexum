#!/usr/bin/env python3
"""Tests for project and supply-agent read tool wiring."""

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("AGENT_BACKEND", "rules")


class TestSupabaseReadImports(unittest.TestCase):
    def test_module_imports(self):
        from domain.project import postgres_read  # noqa: F401
        from domain.supply_price import postgres_supply_read  # noqa: F401
        from domain.agent import supabase_langchain_tools  # noqa: F401
        from mcp_tools import supabase_server_tools  # noqa: F401

    def test_list_user_projects_missing_config(self):
        from domain.project import postgres_read as sb

        with patch.dict(os.environ, {}, clear=True):
            result = sb.list_user_projects("user-uuid")
        self.assertFalse(result["success"])
        self.assertIn("DB_NAME", result["error"])


class TestSupabaseReadMocked(unittest.TestCase):
    def test_list_user_projects_success(self):
        from domain.project import postgres_read as sb

        with patch(
            "domain.project.postgres_read._user_projects",
            return_value=[
                {
                    "id": "proj-1",
                    "nombre": "Obra Norte",
                    "estado": "activo",
                    "membership_role": "admin",
                }
            ],
        ):
            result = sb.list_user_projects("user-1")

        self.assertTrue(result["success"])
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["projects"][0]["nombre"], "Obra Norte")


class TestSupabaseResolve(unittest.TestCase):
    def test_is_valid_uuid(self):
        from domain.project import postgres_read as sb

        self.assertTrue(sb._is_valid_uuid("596c7e07-b277-494a-9c66-0dc453719dc8"))
        self.assertFalse(sb._is_valid_uuid("edificio-nexum-central"))

    def test_looks_like_placeholder(self):
        from domain.project import postgres_read as sb

        self.assertTrue(sb._looks_like_placeholder("<project_id_from_previous_call>"))
        self.assertTrue(sb._looks_like_placeholder("TBD"))
        self.assertFalse(sb._looks_like_placeholder("Edificio Nexum Central"))

    def test_resolve_project_by_name(self):
        from domain.project import postgres_read as sb

        with patch.object(
            sb,
            "_user_projects",
            return_value=[
                {
                    "id": "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
                    "nombre": "Edificio Nexum Central",
                }
            ],
        ):
            resolved, err = sb._resolve_project_id("user-1", "edificio-nexum-central")
        self.assertIsNone(err)
        self.assertEqual(resolved, "cd8d71f7-5de1-4f49-a2c3-5ebf56773c67")

    def test_reject_placeholder_project_id(self):
        from domain.project import postgres_read as sb

        resolved, err = sb._resolve_project_id("user-1", "<project_id_from_previous_call>")
        self.assertIsNone(resolved)
        self.assertFalse(err["success"])
        self.assertEqual(err["code"], "invalid_project_id")


class TestAgentToolRegistration(unittest.TestCase):
    def test_supabase_tools_in_agent(self):
        from domain.agent.supabase_langchain_tools import PROJECT_AGENT_TOOLS
        from domain.agent.agent import AGENT_TOOLS

        self.assertEqual(len(PROJECT_AGENT_TOOLS), 18)
        for tool in PROJECT_AGENT_TOOLS:
            self.assertIn(tool, AGENT_TOOLS)


class TestSupplyPriceRead(unittest.TestCase):
    def test_list_supply_agent_runs_requires_access(self):
        from domain.supply_price import postgres_supply_read as sr

        with patch(
            "domain.supply_price.postgres_supply_read._require_project_id",
            return_value=(None, {"success": False, "error": "forbidden"}),
        ):
            result = sr.list_supply_agent_runs("user-1", "proj-1")
        self.assertFalse(result["success"])

    def test_get_supply_agent_run_success(self):
        from domain.supply_price import postgres_supply_read as sr

        run = {"id": "run-1", "project_id": "proj-1", "status": "completed"}

        with patch(
            "domain.supply_price.postgres_supply_read._require_run_access",
            return_value=(run, None),
        ):
            result = sr.get_supply_agent_run(
                "user-1",
                "run-1",
                include_forecasts=False,
                include_alerts=False,
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["run"]["id"], "run-1")

    def test_list_supply_cost_forecasts_requires_filter(self):
        from domain.supply_price import postgres_supply_read as sr

        result = sr.list_supply_cost_forecasts("user-1")
        self.assertFalse(result["success"])


if __name__ == "__main__":
    unittest.main()
