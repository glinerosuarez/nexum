#!/usr/bin/env python3
"""Direct test of LangGraph agent without HTTP overhead."""

import json
import os
import sys

# Deterministic CI/local test without requiring Ollama.
os.environ.setdefault("AGENT_BACKEND", "rules")

from domain.agent.agent import run_agent


def main() -> int:
    print("[DIRECT TEST] Testing wired LangGraph agent...")

    cases = [
        (
            "Find information about the fastmcp Python package",
            "get_pypi_package_info_tool",
            "3.3",
        ),
        (
            "What is the molecular formula of water?",
            "search_public_chemical_database_tool",
            "H2O",
        ),
    ]

    for query, expected_tool, expected_snippet in cases:
        print(f"\n[QUERY] {query}")
        result = run_agent(query)
        print(json.dumps(result, indent=2))

        if not result.get("success"):
            print(f"❌ Agent failed: {result.get('error', 'Unknown error')}")
            return 1

        tools_used = result.get("tools_used", [])
        tool_names = [t["name"] for t in tools_used]
        if expected_tool not in tool_names:
            print(f"❌ Expected tool {expected_tool}, got {tool_names}")
            return 1

        blob = json.dumps(result.get("tool_results", [])) + result.get("final_result", "")
        if expected_snippet not in blob:
            print(f"❌ Expected '{expected_snippet}' in tool output")
            return 1

        print("✅ Case passed")

    print("\n✅ Agent orchestrator invokes tools and returns real data!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
