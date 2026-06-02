"""LangChain tool wrappers for project read operations."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from domain.project import postgres_read as sb


def _dump(result: dict) -> str:
    return json.dumps(result, default=str)


@tool
def list_user_projects_tool(
    user_id: str, access_token: str | None = None
) -> str:
    """List construction projects the user can access.

    ALWAYS call this first when you need a project_id. Copy projects[].id (UUID) from
    the response for all other project tools.

    Args:
        user_id: Supabase auth user UUID (profiles.id).
        access_token: Optional user JWT for RLS; omit to use service role + membership checks.
    """
    return _dump(sb.list_user_projects(user_id, access_token))


@tool
def get_project_summary_tool(
    user_id: str, project_id: str, access_token: str | None = None
) -> str:
    """Project dashboard: progress, phases, open incidents, latest report and budget.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID from list_user_projects projects[].id, OR exact project nombre.
            Never use placeholders or invented slugs.
        access_token: Optional user JWT.
    """
    return _dump(sb.get_project_summary(user_id, project_id, access_token))


@tool
def list_project_phases_and_activities_tool(
    user_id: str,
    project_id: str,
    phase_id: str = "",
    search: str = "",
    access_token: str | None = None,
) -> str:
    """Work breakdown: phases and activities with planned/executed quantities and progress.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID.
        phase_id: Optional filter to one phase UUID (empty = all phases).
        search: Optional activity/phase name search (empty = no filter).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.list_project_phases_and_activities(
            user_id,
            project_id,
            phase_id or None,
            search or None,
            access_token,
        )
    )


@tool
def get_activity_detail_tool(
    user_id: str, activity_id: str, access_token: str | None = None
) -> str:
    """Single activity with phase, project context, and linked supplies/materials.

    Args:
        user_id: Supabase user UUID.
        activity_id: Activity UUID.
        access_token: Optional user JWT.
    """
    return _dump(sb.get_activity_detail(user_id, activity_id, access_token))


@tool
def get_project_budget_status_tool(
    user_id: str,
    project_id: str,
    budget_snapshot_id: str = "",
    access_token: str | None = None,
) -> str:
    """Budget snapshot (latest or specific version) with line items.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID.
        budget_snapshot_id: Optional snapshot UUID (empty = latest version).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.get_project_budget_status(
            user_id, project_id, budget_snapshot_id or None, access_token
        )
    )


@tool
def list_daily_reports_tool(
    user_id: str,
    project_id: str,
    fecha_desde: str = "",
    fecha_hasta: str = "",
    limit: int = 20,
    access_token: str | None = None,
) -> str:
    """List field daily reports for a project (newest first).

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID.
        fecha_desde: Optional start date YYYY-MM-DD (empty = no filter).
        fecha_hasta: Optional end date YYYY-MM-DD (empty = no filter).
        limit: Max rows (default 20).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.list_daily_reports(
            user_id,
            project_id,
            fecha_desde or None,
            fecha_hasta or None,
            limit,
            access_token,
        )
    )


@tool
def get_daily_report_detail_tool(
    user_id: str,
    daily_report_id: str = "",
    project_id: str = "",
    fecha: str = "",
    access_token: str | None = None,
) -> str:
    """One daily report with executed quantities per activity.

    Args:
        user_id: Supabase user UUID.
        daily_report_id: Report UUID (preferred).
        project_id: Use with fecha if daily_report_id is empty.
        fecha: Date YYYY-MM-DD (use with project_id).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.get_daily_report_detail(
            user_id,
            daily_report_id or None,
            project_id or None,
            fecha or None,
            access_token,
        )
    )


@tool
def list_project_incidents_tool(
    user_id: str,
    project_id: str,
    estado: str = "",
    severidad: str = "",
    solo_abiertos: bool = False,
    access_token: str | None = None,
) -> str:
    """List safety/quality incidents for a project.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID.
        estado: Filter by status e.g. abierto, cerrado (empty = no filter unless solo_abiertos).
        severidad: Filter by severity e.g. baja, media, alta (empty = no filter).
        solo_abiertos: If true, only open incidents.
        access_token: Optional user JWT.
    """
    return _dump(
        sb.list_project_incidents(
            user_id,
            project_id,
            estado or None,
            severidad or None,
            solo_abiertos,
            access_token,
        )
    )


@tool
def get_incident_detail_tool(
    user_id: str, incident_id: str, access_token: str | None = None
) -> str:
    """Full incident record with corrective actions.

    Args:
        user_id: Supabase user UUID.
        incident_id: Incident UUID.
        access_token: Optional user JWT.
    """
    return _dump(sb.get_incident_detail(user_id, incident_id, access_token))


@tool
def get_supply_catalog_search_tool(
    user_id: str,
    query: str,
    tipo: str = "",
    solo_criticos: bool = False,
    limit: int = 25,
    access_token: str | None = None,
) -> str:
    """Search materials/supplies catalog by name with open availability alerts.

    Args:
        user_id: Supabase user UUID.
        query: Text to match in supply nombre.
        tipo: Optional supply type filter (empty = any).
        solo_criticos: If true, only critical supplies.
        limit: Max results (default 25).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.get_supply_catalog_search(
            user_id, query, tipo or None, solo_criticos, limit, access_token
        )
    )


@tool
def get_schedule_status_tool(
    user_id: str,
    project_id: str,
    schedule_baseline_id: str = "",
    access_token: str | None = None,
) -> str:
    """Schedule baseline with planned vs actual dates and progress per activity.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID or nombre.
        schedule_baseline_id: Optional baseline UUID (empty = latest).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.get_schedule_status(
            user_id, project_id, schedule_baseline_id or None, access_token
        )
    )


@tool
def list_overdue_schedule_items_tool(
    user_id: str,
    project_id: str,
    schedule_baseline_id: str = "",
    access_token: str | None = None,
) -> str:
    """Schedule items past planned end date with no actual finish date.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID or nombre.
        schedule_baseline_id: Optional baseline UUID (empty = latest).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.list_overdue_schedule_items(
            user_id, project_id, schedule_baseline_id or None, access_token
        )
    )


@tool
def list_purchase_orders_tool(
    user_id: str,
    project_id: str,
    estado: str = "",
    access_token: str | None = None,
) -> str:
    """List purchase orders for a project with supplier and line items.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID or nombre.
        estado: Optional filter e.g. borrador, emitida (empty = all).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.list_purchase_orders(user_id, project_id, estado or None, access_token)
    )


@tool
def get_purchase_order_detail_tool(
    user_id: str, purchase_order_id: str, access_token: str | None = None
) -> str:
    """Full purchase order with items, supplier, and payments.

    Args:
        user_id: Supabase user UUID.
        purchase_order_id: Purchase order UUID.
        access_token: Optional user JWT.
    """
    return _dump(sb.get_purchase_order_detail(user_id, purchase_order_id, access_token))


@tool
def search_suppliers_tool(
    user_id: str,
    query: str,
    solo_activos: bool = True,
    limit: int = 25,
    access_token: str | None = None,
) -> str:
    """Search suppliers by name (global catalog).

    Args:
        user_id: Supabase user UUID.
        query: Text to match in supplier nombre.
        solo_activos: If true, only active suppliers (default true).
        limit: Max results (default 25).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.search_suppliers(user_id, query, solo_activos, limit, access_token)
    )


@tool
def list_payroll_periods_tool(
    user_id: str, project_id: str, access_token: str | None = None
) -> str:
    """List payroll periods for a construction project.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID or nombre.
        access_token: Optional user JWT.
    """
    return _dump(sb.list_payroll_periods(user_id, project_id, access_token))


@tool
def get_payroll_period_detail_tool(
    user_id: str, payroll_period_id: str, access_token: str | None = None
) -> str:
    """Payroll period with employee entries and totals.

    Args:
        user_id: Supabase user UUID.
        payroll_period_id: Payroll period UUID.
        access_token: Optional user JWT.
    """
    return _dump(
        sb.get_payroll_period_detail(user_id, payroll_period_id, access_token)
    )


@tool
def list_project_team_tool(
    user_id: str,
    project_id: str,
    solo_activos: bool = True,
    access_token: str | None = None,
) -> str:
    """Project team roster with roles and profile details.

    Args:
        user_id: Supabase user UUID.
        project_id: Project UUID or nombre.
        solo_activos: If true, only active memberships (default true).
        access_token: Optional user JWT.
    """
    return _dump(
        sb.list_project_team(user_id, project_id, solo_activos, access_token)
    )


PROJECT_AGENT_TOOLS = [
    list_user_projects_tool,
    get_project_summary_tool,
    list_project_phases_and_activities_tool,
    get_activity_detail_tool,
    get_project_budget_status_tool,
    list_daily_reports_tool,
    get_daily_report_detail_tool,
    list_project_incidents_tool,
    get_incident_detail_tool,
    get_supply_catalog_search_tool,
    get_schedule_status_tool,
    list_overdue_schedule_items_tool,
    list_purchase_orders_tool,
    get_purchase_order_detail_tool,
    search_suppliers_tool,
    list_payroll_periods_tool,
    get_payroll_period_detail_tool,
    list_project_team_tool,
]

SUPABASE_AGENT_TOOLS = PROJECT_AGENT_TOOLS
