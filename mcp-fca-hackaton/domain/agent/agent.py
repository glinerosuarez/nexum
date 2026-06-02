"""LangGraph agent with Vertex AI, Ollama, or rule-based fallback.

Minikube → host Ollama
----------------------
Pods cannot use ``localhost:11434`` for Ollama on your laptop. Use a host-reachable URL:

- **Minikube (recommended):** ``OLLAMA_BASE_URL=http://host.minikube.internal:11434``
- **Linux + Docker driver:** gateway IP, e.g. ``http://192.168.49.1:11434``
- **Local run (no k8s):** ``http://127.0.0.1:11434``

On the host, bind Ollama to all interfaces::

    export OLLAMA_HOST=0.0.0.0:11434
    ollama serve

Pull the model on the host::

    ollama pull qwen2.5:7b

Environment variables
---------------------
AGENT_BACKEND       ``vertex`` (default), ``ollama``, or ``rules``

# Vertex backend
VERTEX_PROJECT_ID   GCP project id (optional if inferred from ADC)
VERTEX_LOCATION     Vertex region (default: us-central1)
VERTEX_MODEL        Gemini model id (default: gemini-1.5-pro)
VERTEX_TEMPERATURE  Sampling temperature (default: 0)

# Ollama backend
OLLAMA_BASE_URL     Ollama API base URL
OLLAMA_MODEL        Model tag (default: qwen2.5:7b)
OLLAMA_TEMPERATURE  Sampling temperature (default: 0)
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from typing import Annotated, Any, TypedDict

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
)
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, create_react_agent

from demo.api_tools import fetch_compound, fetch_pypi_package
from domain.agent.supabase_langchain_tools import PROJECT_AGENT_TOOLS

logger = logging.getLogger("mcp-langgraph-agent")

DEFAULT_OLLAMA_BASE_URL = "http://host.minikube.internal:11434"
DEFAULT_OLLAMA_MODEL = "qwen2.5:7b"
DEFAULT_VERTEX_LOCATION = "us-central1"
DEFAULT_VERTEX_MODEL = "gemini-1.5-pro"

SYSTEM_PROMPT = """You are a construction project management assistant.

Supabase tools require real UUIDs from tool responses — never invent placeholders like
<project_id_from_previous_call> or slug names like edificio-nexum-central.

Workflow for project questions:
1. Call list_user_projects with user_id.
2. Copy the exact projects[].id UUID from the JSON response.
3. Pass that UUID as project_id to get_project_summary and other project tools.

You may also pass the exact project nombre (e.g. "Edificio Nexum Central") as project_id;
the server will resolve it. Slugs and placeholders are rejected.

Optional: PyPI and PubChem lookup tools.

Use the minimum tools needed. Answer concisely in the user's language."""

_PYPI_HINTS = (
    "pypi",
    "python package",
    "pip package",
    "package on pypi",
    "package info",
    "package information",
)
_CHEM_HINTS = (
    "compound",
    "chemical",
    "molecule",
    "pubchem",
    "molecular",
    "formula of",
    "iupac",
)


class AgentStateSchema(TypedDict):
    user_query: str
    messages: Annotated[list[BaseMessage], add_messages]
    tool_calls: list[dict[str, Any]]
    final_result: str


@tool
def get_pypi_package_info_tool(package_name: str) -> str:
    """Look up a Python package on PyPI by exact package name.

    Use for libraries, pip packages, versions, authors, licenses.
    Examples: fastmcp, httpx, django, langgraph.

    Args:
        package_name: Exact PyPI project name (lowercase, hyphens allowed).
    """
    return json.dumps(fetch_pypi_package(package_name))


@tool
def search_public_chemical_database_tool(compound_name: str) -> str:
    """Look up a chemical compound in PubChem by common name.

    Use for molecular formula, weight, IUPAC name, CID.
    Examples: water, aspirin, caffeine, ethanol.

    Args:
        compound_name: Common English name of the compound.
    """
    return json.dumps(fetch_compound(compound_name))


AGENT_TOOLS = [
    *PROJECT_AGENT_TOOLS,
    get_pypi_package_info_tool,
    search_public_chemical_database_tool,
]


def agent_backend() -> str:
    """Return ``vertex``, ``ollama``, or ``rules``."""
    return os.environ.get("AGENT_BACKEND", "vertex").strip().lower()


def ollama_base_url() -> str:
    return os.environ.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL).rstrip("/")


def ollama_model() -> str:
    return os.environ.get("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)


def vertex_project_id() -> str | None:
    value = os.environ.get("VERTEX_PROJECT_ID", "").strip()
    return value or None


def vertex_location() -> str:
    return os.environ.get("VERTEX_LOCATION", DEFAULT_VERTEX_LOCATION).strip()


def vertex_model() -> str:
    return os.environ.get("VERTEX_MODEL", DEFAULT_VERTEX_MODEL).strip()


def _new_tool_call_id() -> str:
    return f"call_{uuid.uuid4().hex[:12]}"


def _extract_pypi_package(query: str) -> str | None:
    patterns = [
        r"(?:python\s+)?package\s+['\"]?([\w][\w.-]*)['\"]?",
        r"about\s+(?:the\s+)?([\w][\w.-]*)\s+python\s+package",
        r"package\s+['\"]([\w][\w.-]*)['\"]",
        r"on\s+pypi[:\s]+['\"]?([\w][\w.-]*)['\"]?",
        r"pypi[:\s]+['\"]?([\w][\w.-]*)['\"]?",
    ]
    for pattern in patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            return match.group(1).lower()

    quoted = re.findall(r"['\"]([\w][\w.-]*)['\"]", query)
    for candidate in quoted:
        if re.fullmatch(r"[\w][\w.-]*", candidate):
            return candidate.lower()
    return None


def _extract_compound(query: str) -> str | None:
    patterns = [
        r"(?:compound|chemical|molecule)\s+['\"]?([\w][\w.-]*)['\"]?",
        r"(?:formula|properties|information)\s+(?:of|for)\s+['\"]?([\w][\w.-]*)['\"]?",
        r"search(?:ing)?\s+(?:for\s+)?['\"]?([\w][\w.-]*)['\"]?",
    ]
    for pattern in patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            name = match.group(1).lower()
            if name not in {"the", "a", "an", "about", "for", "of"}:
                return name

    quoted = re.findall(r"['\"]([\w][\w.-]*)['\"]", query)
    if quoted:
        return quoted[-1].lower()
    return None


def _wants_pypi(query: str) -> bool:
    lower = query.lower()
    if any(hint in lower for hint in _PYPI_HINTS):
        return True
    return _extract_pypi_package(query) is not None


def _wants_chemical(query: str) -> bool:
    lower = query.lower()
    if any(hint in lower for hint in _CHEM_HINTS):
        return True
    return _extract_compound(query) is not None


def plan_tool_calls(query: str) -> list[dict[str, Any]]:
    """Map a natural-language query to concrete LangChain tool calls (rules backend)."""
    calls: list[dict[str, Any]] = []

    if _wants_pypi(query):
        package = _extract_pypi_package(query)
        if package:
            calls.append(
                {
                    "name": get_pypi_package_info_tool.name,
                    "args": {"package_name": package},
                    "id": _new_tool_call_id(),
                    "type": "tool_call",
                }
            )

    if _wants_chemical(query):
        compound = _extract_compound(query)
        if compound:
            calls.append(
                {
                    "name": search_public_chemical_database_tool.name,
                    "args": {"compound_name": compound},
                    "id": _new_tool_call_id(),
                    "type": "tool_call",
                }
            )

    return calls


def synthesize_final_result(query: str, tool_messages: list[ToolMessage]) -> str:
    """Turn tool outputs into a human-readable answer (rules backend)."""
    if not tool_messages:
        return (
            "I could not determine which tools to run for this query. "
            "Try mentioning a Python package (e.g. fastmcp) or a compound (e.g. water)."
        )

    sections: list[str] = []
    for message in tool_messages:
        try:
            data = json.loads(message.content)
        except (json.JSONDecodeError, TypeError):
            sections.append(str(message.content))
            continue

        if "error" in data:
            sections.append(f"Error: {data['error']}")
        elif "package" in data:
            sections.append(
                f"PyPI package '{data['package']}' "
                f"(v{data.get('latest_version', 'unknown')}): "
                f"{data.get('summary') or 'No summary available'}. "
                f"Author: {data.get('author') or 'unknown'}."
            )
        elif "compound" in data:
            sections.append(
                f"Compound '{data['compound']}' — "
                f"formula {data.get('formula')}, "
                f"molecular weight {data.get('molecular_weight')}, "
                f"IUPAC name {data.get('iupac_name') or 'n/a'} "
                f"(CID {data.get('database_id')})."
            )
        else:
            sections.append(json.dumps(data))

    return f"Results for '{query}':\n" + "\n".join(sections)


def _extract_tools_used(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    used: list[dict[str, Any]] = []
    for message in messages:
        if isinstance(message, AIMessage) and message.tool_calls:
            for call in message.tool_calls:
                used.append(
                    {
                        "name": call.get("name"),
                        "args": call.get("args", {}),
                        "id": call.get("id"),
                    }
                )
    return used


def _extract_tool_results(messages: list[BaseMessage]) -> list[Any]:
    results: list[Any] = []
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        try:
            results.append(json.loads(message.content))
        except (json.JSONDecodeError, TypeError):
            results.append({"raw": message.content})
    return results


def _extract_final_result(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and message.content and not message.tool_calls:
            content = message.content
            return content if isinstance(content, str) else str(content)
    tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
    if tool_messages:
        return synthesize_final_result("", tool_messages)
    return "Agent completed with no response."


def create_ollama_agent():
    """ReAct agent backed by Ollama (DeepSeek or other local model)."""
    from langchain_ollama import ChatOllama

    temperature = float(os.environ.get("OLLAMA_TEMPERATURE", "0"))
    model = ChatOllama(
        model=ollama_model(),
        base_url=ollama_base_url(),
        temperature=temperature,
    )
    logger.info(
        "Creating Ollama ReAct agent model=%s base_url=%s",
        ollama_model(),
        ollama_base_url(),
    )
    return create_react_agent(model, AGENT_TOOLS, prompt=SYSTEM_PROMPT)


def create_vertex_agent():
    """ReAct agent backed by Vertex AI Gemini models."""
    from langchain_google_vertexai import ChatVertexAI

    temperature = float(os.environ.get("VERTEX_TEMPERATURE", "0"))
    model = ChatVertexAI(
        model=vertex_model(),
        project=vertex_project_id(),
        location=vertex_location(),
        temperature=temperature,
    )
    logger.info(
        "Creating Vertex ReAct agent model=%s location=%s project=%s",
        vertex_model(),
        vertex_location(),
        vertex_project_id() or "<adc>",
    )
    return create_react_agent(model, AGENT_TOOLS, prompt=SYSTEM_PROMPT)


def create_rules_agent():
    """Rule-based plan → tools → synthesize graph (no LLM)."""
    tool_node = ToolNode(AGENT_TOOLS)

    def plan_node(state: dict[str, Any]) -> dict[str, Any]:
        query = state.get("user_query", "")
        planned = plan_tool_calls(query)
        logger.info("Planned %d tool call(s) for query: %s", len(planned), query)

        messages: list[BaseMessage] = [HumanMessage(content=query)]
        tool_calls_meta: list[dict[str, Any]] = []

        if planned:
            messages.append(
                AIMessage(
                    content="Planning tool calls to answer your query.",
                    tool_calls=planned,
                )
            )
            tool_calls_meta = [
                {"name": call["name"], "args": call["args"], "id": call["id"]}
                for call in planned
            ]
        else:
            summary = synthesize_final_result(query, [])
            messages.append(AIMessage(content=summary))

        return {
            "messages": messages,
            "tool_calls": tool_calls_meta,
            "final_result": state.get("final_result", ""),
        }

    def synthesize_node(state: dict[str, Any]) -> dict[str, Any]:
        query = state.get("user_query", "")
        tool_messages = [
            m for m in state.get("messages", []) if isinstance(m, ToolMessage)
        ]
        summary = synthesize_final_result(query, tool_messages)
        return {
            "messages": [AIMessage(content=summary)],
            "final_result": summary,
        }

    def route_after_plan(state: dict[str, Any]) -> str:
        messages = state.get("messages", [])
        if messages and isinstance(messages[-1], AIMessage):
            if getattr(messages[-1], "tool_calls", None):
                return "tools"
        return "synthesize"

    graph = StateGraph(AgentStateSchema)
    graph.add_node("plan", plan_node)
    graph.add_node("tools", tool_node)
    graph.add_node("synthesize", synthesize_node)
    graph.set_entry_point("plan")
    graph.add_conditional_edges(
        "plan",
        route_after_plan,
        {"tools": "tools", "synthesize": "synthesize"},
    )
    graph.add_conditional_edges(
        "tools",
        lambda _state: "synthesize",
        {"synthesize": "synthesize"},
    )
    graph.add_edge("synthesize", END)
    return graph.compile()


def create_agent():
    backend = agent_backend()
    if backend == "rules":
        return create_rules_agent()
    if backend == "vertex":
        return create_vertex_agent()
    return create_ollama_agent()


_agent = None
_agent_mode: str | None = None


def get_agent():
    global _agent, _agent_mode
    mode = agent_backend()
    if _agent is None or _agent_mode != mode:
        _agent = create_agent()
        _agent_mode = mode
    return _agent


def _run_ollama_agent(agent, query: str) -> dict[str, Any]:
    final_state = agent.invoke({"messages": [HumanMessage(content=query)]})
    messages = final_state.get("messages", [])
    return {
        "success": True,
        "query": query,
        "backend": "ollama",
        "model": ollama_model(),
        "ollama_base_url": ollama_base_url(),
        "tools_used": _extract_tools_used(messages),
        "tool_results": _extract_tool_results(messages),
        "final_result": _extract_final_result(messages),
    }


def _run_vertex_agent(agent, query: str) -> dict[str, Any]:
    final_state = agent.invoke({"messages": [HumanMessage(content=query)]})
    messages = final_state.get("messages", [])
    return {
        "success": True,
        "query": query,
        "backend": "vertex",
        "model": vertex_model(),
        "vertex_location": vertex_location(),
        "vertex_project_id": vertex_project_id(),
        "tools_used": _extract_tools_used(messages),
        "tool_results": _extract_tool_results(messages),
        "final_result": _extract_final_result(messages),
    }


def _run_rules_agent(agent, query: str) -> dict[str, Any]:
    final_state = agent.invoke(
        {
            "user_query": query,
            "messages": [],
            "tool_calls": [],
            "final_result": "",
        }
    )
    tool_messages = [
        m for m in final_state.get("messages", []) if isinstance(m, ToolMessage)
    ]
    tool_results = _extract_tool_results(tool_messages)
    return {
        "success": True,
        "query": query,
        "backend": "rules",
        "tools_used": final_state.get("tool_calls", []),
        "tool_results": tool_results,
        "final_result": final_state.get("final_result", ""),
    }


def run_agent(query: str) -> dict[str, Any]:
    """Run the agent graph for a natural-language query."""
    agent = get_agent()
    backend = agent_backend()

    try:
        if backend == "rules":
            return _run_rules_agent(agent, query)
        if backend == "vertex":
            return _run_vertex_agent(agent, query)
        return _run_ollama_agent(agent, query)
    except Exception as exc:
        logger.error("Agent execution error (%s): %s", backend, exc)
        if backend in {"ollama", "vertex"}:
            logger.warning(
                "Falling back to rules backend after %s failure",
                backend,
            )
            try:
                fallback = create_rules_agent()
                result = _run_rules_agent(fallback, query)
                result["backend"] = "rules"
                result[f"{backend}_fallback"] = True
                result[f"{backend}_error"] = str(exc)
                return result
            except Exception as fallback_exc:
                logger.error("Rules fallback failed: %s", fallback_exc)
        return {
            "success": False,
            "query": query,
            "backend": backend,
            "error": str(exc),
        }
