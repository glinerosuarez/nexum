# server.py
import os
import logging
from fastmcp import FastMCP
from domain.agent.agent import run_agent
from demo.api_tools import fetch_compound, fetch_pypi_package
from domain.supply_price.forecast_chart import generate_material_price_forecast_chart
from domain.supply_price.material_price_forecast import (
    material_price_forecast as run_material_price_forecast,
)
from mcp_tools.supabase_server_tools import (
    register_project_read_tools,
    register_supply_price_read_tools,
)

# Configure production logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("mcp-production-server")

# Initialize FastMCP in SSE mode
mcp = FastMCP(
    "Public API & DB Gateway 🚀"
)

register_project_read_tools(mcp)
register_supply_price_read_tools(mcp)

# -----------------------------------------------------------------------------
# TOOL 1: CONSUMING A PUBLIC API (PyPI Metadata Gateway)
# -----------------------------------------------------------------------------
@mcp.tool()
def get_pypi_package_info(package_name: str) -> dict:
    """
    Fetches real-time release and metadata information for a package from the public PyPI API.

    Args:
        package_name: The exact name of the Python package (e.g., 'fastmcp', 'httpx').
    """
    logger.info(f"Tool 'get_pypi_package_info' invoked for package: {package_name}")
    return fetch_pypi_package(package_name)


# -----------------------------------------------------------------------------
# TOOL 2: CONSUMING A PUBLIC DATABASE (PubChem Global Database Pattern)
# -----------------------------------------------------------------------------
@mcp.tool()
def search_public_chemical_database(compound_name: str) -> dict:
    """
    Queries a public read-only database layer via standard structural connection patterns.
    For production stability, this wraps an open chemical repository layout.

    Args:
        compound_name: Common name of the chemical compound to search (e.g., 'water', 'aspirin').
    """
    logger.info(f"Tool 'search_public_chemical_database' invoked for compound: {compound_name}")
    return fetch_compound(compound_name)


# -----------------------------------------------------------------------------
# TOOL 4: MATERIAL PRICE FORECAST (Market data + budget impact)
# -----------------------------------------------------------------------------
@mcp.tool()
def material_price_forecast(
    user_id: str,
    project_id: str,
    run_id: str | None = None,
    horizon_months: int = 6,
    material_queries: list[str] | None = None,
    history_months: int = 36,
    access_token: str | None = None,
    persist: bool = True,
    overrun_threshold_pct: float = 10.0,
    trigger: str = "mcp",
    dry_run: bool = False,
) -> dict:
    """
    Forecast construction material prices for supplies in a project's budget.

    Fetches historical market indices from FRED (US PPI proxies), projects
    future index trends, estimates budget exposure, and persists run data to
    supply_agent_runs, supply_price_observations, supply_cost_forecasts, and
    supply_cost_overrun_alerts when tables are available.

    Args:
        user_id: Profile UUID with project access.
        project_id: Project UUID or exact project nombre.
        horizon_months: Forecast horizon in months (1-24, default 6).
        material_queries: Optional supply name filters, e.g. ["cemento", "acero"].
        history_months: Historical window in months (12-120, default 36).
        access_token: Optional user JWT.
        persist: Write run/observations/forecasts/alerts to Cloud SQL (default True).
        overrun_threshold_pct: Alert threshold for projected budget increase %.
        trigger: Run origin label: manual, cron, or mcp.
        dry_run: Compute only; skip database writes.
    """
    logger.info(
        "Tool 'material_price_forecast' project=%s horizon=%s persist=%s",
        project_id,
        horizon_months,
        persist,
    )
    return run_material_price_forecast(
        user_id=user_id,
        project_id=project_id,
        run_id=run_id,
        horizon_months=horizon_months,
        material_queries=material_queries,
        history_months=history_months,
        access_token=access_token,
        persist=persist,
        overrun_threshold_pct=overrun_threshold_pct,
        trigger=trigger,
        dry_run=dry_run,
    )


# -----------------------------------------------------------------------------
# TOOL 5: MATERIAL PRICE FORECAST CHART (Plan vs forecast visualization)
# -----------------------------------------------------------------------------
@mcp.tool()
def material_price_forecast_chart(
    user_id: str,
    run_id: str | None = None,
    project_id: str | None = None,
    supply_id: str | None = None,
    include_observations: bool = True,
    access_token: str | None = None,
) -> dict:
    """
    Generate SVG charts comparing budget plan vs forecast after material_price_forecast.

    Pass run_id from the forecast response, or call immediately after material_price_forecast
    in the same session. Returns per-supply timeline charts plus a project budget bar chart.

    Args:
        user_id: Profile UUID with project access.
        run_id: supply_agent_runs.id from material_price_forecast (recommended).
        project_id: Optional; inferred from run when omitted.
        supply_id: Optional filter to chart one supply only.
        include_observations: Overlay historical index points on supply charts.
        access_token: Optional user JWT.
    """
    logger.info(
        "Tool 'material_price_forecast_chart' run_id=%s supply_id=%s",
        run_id,
        supply_id,
    )
    return generate_material_price_forecast_chart(
        user_id,
        run_id=run_id,
        project_id=project_id,
        supply_id=supply_id,
        include_observations=include_observations,
        access_token=access_token,
    )


# -----------------------------------------------------------------------------
# TOOL 3: LANGGRAPH AGENT (Orchestrates existing tools)
# -----------------------------------------------------------------------------
@mcp.tool()
def langgraph_agent_orchestrator(query: str) -> dict:
    """
    LangGraph-based agent that orchestrates the existing tools to answer complex queries.
    Demonstrates multi-step reasoning and tool coordination.

    Args:
        query: Natural language query or task description for the agent to handle.
    """
    logger.info(f"Tool 'langgraph_agent_orchestrator' invoked with query: {query}")

    try:
        result = run_agent(query)
        return result
    except Exception as exc:
        logger.error(f"Agent orchestration error: {exc}")
        return {
            "success": False,
            "error": f"Agent failed: {str(exc)}"
        }


if __name__ == "__main__":
    HOST = os.environ.get("MCP_HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", os.environ.get("MCP_PORT", "8000")))

    logger.info(f"Starting Production FastMCP HTTP Server on {HOST}:{PORT}")
    # Run server using the HTTP transport so it listens on a TCP port
    mcp.run(transport="http", host=HOST, port=PORT)
