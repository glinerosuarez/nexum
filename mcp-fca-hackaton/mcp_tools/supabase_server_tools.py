"""MCP tool registration helpers for project and supply-agent read tools."""

from __future__ import annotations

import logging

from domain.project import postgres_read as sb
from domain.supply_price import postgres_supply_read as supply_sb

logger = logging.getLogger("mcp-supabase-server")


def register_project_read_tools(mcp) -> None:
    """Register project read tools on a FastMCP instance."""

    @mcp.tool()
    def list_user_projects(
        user_id: str, access_token: str | None = None
    ) -> dict:
        """List construction projects the user can access (via project_memberships)."""
        logger.info("list_user_projects for user %s", user_id)
        return sb.list_user_projects(user_id, access_token)

    @mcp.tool()
    def get_project_summary(
        user_id: str, project_id: str, access_token: str | None = None
    ) -> dict:
        """Project dashboard: progress, phases, open incidents, latest report and budget."""
        logger.info("get_project_summary project=%s", project_id)
        return sb.get_project_summary(user_id, project_id, access_token)

    @mcp.tool()
    def list_project_phases_and_activities(
        user_id: str,
        project_id: str,
        phase_id: str | None = None,
        search: str | None = None,
        access_token: str | None = None,
    ) -> dict:
        """Phases and activities with planned/executed quantities and progress %."""
        return sb.list_project_phases_and_activities(
            user_id, project_id, phase_id, search, access_token
        )

    @mcp.tool()
    def get_activity_detail(
        user_id: str, activity_id: str, access_token: str | None = None
    ) -> dict:
        """Activity detail with linked supplies from supply_catalog."""
        return sb.get_activity_detail(user_id, activity_id, access_token)

    @mcp.tool()
    def get_project_budget_status(
        user_id: str,
        project_id: str,
        budget_snapshot_id: str | None = None,
        access_token: str | None = None,
    ) -> dict:
        """Latest or specific budget snapshot with line items."""
        return sb.get_project_budget_status(
            user_id, project_id, budget_snapshot_id, access_token
        )

    @mcp.tool()
    def list_daily_reports(
        user_id: str,
        project_id: str,
        fecha_desde: str | None = None,
        fecha_hasta: str | None = None,
        limit: int = 20,
        access_token: str | None = None,
    ) -> dict:
        """List daily field reports for a project."""
        return sb.list_daily_reports(
            user_id, project_id, fecha_desde, fecha_hasta, limit, access_token
        )

    @mcp.tool()
    def get_daily_report_detail(
        user_id: str,
        daily_report_id: str | None = None,
        project_id: str | None = None,
        fecha: str | None = None,
        access_token: str | None = None,
    ) -> dict:
        """Daily report with per-activity executed quantities."""
        return sb.get_daily_report_detail(
            user_id, daily_report_id, project_id, fecha, access_token
        )

    @mcp.tool()
    def list_project_incidents(
        user_id: str,
        project_id: str,
        estado: str | None = None,
        severidad: str | None = None,
        solo_abiertos: bool = False,
        access_token: str | None = None,
    ) -> dict:
        """List project incidents (safety/quality issues)."""
        return sb.list_project_incidents(
            user_id, project_id, estado, severidad, solo_abiertos, access_token
        )

    @mcp.tool()
    def get_incident_detail(
        user_id: str, incident_id: str, access_token: str | None = None
    ) -> dict:
        """Incident with corrective actions."""
        return sb.get_incident_detail(user_id, incident_id, access_token)

    @mcp.tool()
    def get_supply_catalog_search(
        user_id: str,
        query: str,
        tipo: str | None = None,
        solo_criticos: bool = False,
        limit: int = 25,
        access_token: str | None = None,
    ) -> dict:
        """Search supply catalog by name; includes open availability alerts."""
        return sb.get_supply_catalog_search(
            user_id, query, tipo, solo_criticos, limit, access_token
        )

    @mcp.tool()
    def get_schedule_status(
        user_id: str,
        project_id: str,
        schedule_baseline_id: str | None = None,
        access_token: str | None = None,
    ) -> dict:
        """Schedule baseline with planned vs actual dates per activity."""
        return sb.get_schedule_status(
            user_id, project_id, schedule_baseline_id, access_token
        )

    @mcp.tool()
    def list_overdue_schedule_items(
        user_id: str,
        project_id: str,
        schedule_baseline_id: str | None = None,
        access_token: str | None = None,
    ) -> dict:
        """Schedule items past planned end date without actual finish."""
        return sb.list_overdue_schedule_items(
            user_id, project_id, schedule_baseline_id, access_token
        )

    @mcp.tool()
    def list_purchase_orders(
        user_id: str,
        project_id: str,
        estado: str | None = None,
        access_token: str | None = None,
    ) -> dict:
        """List purchase orders for a project with supplier info."""
        return sb.list_purchase_orders(user_id, project_id, estado, access_token)

    @mcp.tool()
    def get_purchase_order_detail(
        user_id: str, purchase_order_id: str, access_token: str | None = None
    ) -> dict:
        """Purchase order with line items, supplier, and payments."""
        return sb.get_purchase_order_detail(user_id, purchase_order_id, access_token)

    @mcp.tool()
    def search_suppliers(
        user_id: str,
        query: str,
        solo_activos: bool = True,
        limit: int = 25,
        access_token: str | None = None,
    ) -> dict:
        """Search suppliers by name."""
        return sb.search_suppliers(user_id, query, solo_activos, limit, access_token)

    @mcp.tool()
    def list_payroll_periods(
        user_id: str, project_id: str, access_token: str | None = None
    ) -> dict:
        """List payroll periods for a project."""
        return sb.list_payroll_periods(user_id, project_id, access_token)

    @mcp.tool()
    def get_payroll_period_detail(
        user_id: str, payroll_period_id: str, access_token: str | None = None
    ) -> dict:
        """Payroll period with employee entries and totals."""
        return sb.get_payroll_period_detail(user_id, payroll_period_id, access_token)

    @mcp.tool()
    def list_project_team(
        user_id: str,
        project_id: str,
        solo_activos: bool = True,
        access_token: str | None = None,
    ) -> dict:
        """Project team roster with roles and profiles."""
        return sb.list_project_team(user_id, project_id, solo_activos, access_token)


def register_supply_price_read_tools(mcp) -> None:
    """Register read tools for persisted supply price agent data."""

    @mcp.tool()
    def list_supply_agent_runs(
        user_id: str,
        project_id: str,
        status: str | None = None,
        limit: int = 20,
        access_token: str | None = None,
    ) -> dict:
        """List material price agent runs for a project (newest first)."""
        return supply_sb.list_supply_agent_runs(
            user_id, project_id, status, limit, access_token
        )

    @mcp.tool()
    def get_supply_agent_run(
        user_id: str,
        run_id: str,
        include_forecasts: bool = False,
        include_alerts: bool = True,
        access_token: str | None = None,
    ) -> dict:
        """Get a supply price agent run with optional alerts and forecasts."""
        return supply_sb.get_supply_agent_run(
            user_id, run_id, include_forecasts, include_alerts, access_token
        )

    @mcp.tool()
    def list_supply_cost_overrun_alerts(
        user_id: str,
        project_id: str,
        status: str | None = None,
        limit: int = 25,
        access_token: str | None = None,
    ) -> dict:
        """List budget overrun alerts for a project."""
        return supply_sb.list_supply_cost_overrun_alerts(
            user_id, project_id, status, limit, access_token
        )

    @mcp.tool()
    def list_supply_price_observations(
        user_id: str,
        supply_id: str,
        project_id: str,
        fecha_desde: str | None = None,
        fecha_hasta: str | None = None,
        limit: int = 100,
        access_token: str | None = None,
    ) -> dict:
        """List scraped/index price observations for a supply in a project."""
        return supply_sb.list_supply_price_observations(
            user_id,
            supply_id,
            project_id,
            fecha_desde,
            fecha_hasta,
            limit,
            access_token,
        )

    @mcp.tool()
    def list_supply_cost_forecasts(
        user_id: str,
        project_id: str | None = None,
        run_id: str | None = None,
        supply_id: str | None = None,
        limit: int = 100,
        access_token: str | None = None,
    ) -> dict:
        """List stored cost forecasts by project, run, and/or supply."""
        return supply_sb.list_supply_cost_forecasts(
            user_id, project_id, run_id, supply_id, limit, access_token
        )

    @mcp.tool()
    def list_supply_price_sources(
        user_id: str,
        supply_id: str,
        solo_activos: bool = True,
        access_token: str | None = None,
    ) -> dict:
        """List configured external price sources for a catalog supply."""
        return supply_sb.list_supply_price_sources(
            user_id, supply_id, solo_activos, access_token
        )


register_supabase_read_tools = register_project_read_tools
