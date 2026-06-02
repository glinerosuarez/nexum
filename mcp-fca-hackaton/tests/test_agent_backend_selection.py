"""Unit tests for agent backend routing."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from domain.agent import agent as agent_module


class AgentBackendSelectionTests(unittest.TestCase):
    def test_agent_backend_defaults_to_vertex(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(agent_module.agent_backend(), "vertex")

    def test_create_agent_uses_vertex_backend(self) -> None:
        with patch.dict(os.environ, {"AGENT_BACKEND": "vertex"}, clear=False):
            with patch.object(agent_module, "create_vertex_agent", return_value="vertex-agent") as mock_vertex:
                self.assertEqual(agent_module.create_agent(), "vertex-agent")
                mock_vertex.assert_called_once()

    def test_create_agent_uses_rules_backend(self) -> None:
        with patch.dict(os.environ, {"AGENT_BACKEND": "rules"}, clear=False):
            with patch.object(agent_module, "create_rules_agent", return_value="rules-agent") as mock_rules:
                self.assertEqual(agent_module.create_agent(), "rules-agent")
                mock_rules.assert_called_once()

    def test_create_agent_falls_back_to_ollama_backend(self) -> None:
        with patch.dict(os.environ, {"AGENT_BACKEND": "ollama"}, clear=False):
            with patch.object(agent_module, "create_ollama_agent", return_value="ollama-agent") as mock_ollama:
                self.assertEqual(agent_module.create_agent(), "ollama-agent")
                mock_ollama.assert_called_once()


if __name__ == "__main__":
    unittest.main()
