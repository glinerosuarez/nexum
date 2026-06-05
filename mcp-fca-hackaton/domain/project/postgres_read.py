"""Cloud SQL read helpers for construction project tools."""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from infra.postgres_client import PostgresConfigError, get_conn

logger = logging.getLogger("mcp-project-postgres-read")

_PLACEHOLDER_PATTERN = re.compile(
    r"(^<|\>$|from_previous|placeholder|TBD|\bexample\b|your_.*_here)",
    re.IGNORECASE,
)


def _error(message: str, **extra: Any) -> dict[str, Any]:
    return {"success": False, "error": message, **extra}


def _ok(**payload: Any) -> dict[str, Any]:
    return {"success": True, **payload}


def _run(name: str, fn):
    try:
        return fn()
    except PostgresConfigError as exc:
        logger.warning("Postgres config: %s", exc)
        return _error(str(exc))
    except PermissionError as exc:
        return _error(str(exc), code="forbidden")
    except Exception as exc:
        logger.exception("Postgres read failed in %s", name)
        return _error(f"{name} failed: {exc}")


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value).strip())
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _looks_like_placeholder(value: str) -> bool:
    if not value or not str(value).strip():
        return True
    return bool(_PLACEHOLDER_PATTERN.search(str(value).strip()))


def _user_projects(user_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select
                  p.id,
                  p.nombre,
                  p.descripcion,
                  p.estado,
                  p.fecha_inicio_planeada,
                  p.fecha_fin_planeada,
                  p.presupuesto_total,
                  pm.role as membership_role
                from project_memberships pm
                join projects p on p.id = pm.project_id
                where pm.profile_id = %s
                  and coalesce(pm.active, true) = true
                order by p.created_at desc
                """,
                (user_id,),
            )
            rows = cur.fetchall()
        conn.commit()
    return rows


def _assert_project_access(user_id: str, project_id: str, access_token: str | None = None) -> None:
    del access_token
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select 1
                from project_memberships
                where project_id = %s
                  and profile_id = %s
                  and coalesce(active, true) = true
                limit 1
                """,
                (project_id, user_id),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise PermissionError(
            f"User {user_id} has no active membership for project {project_id}.",
        )


def _resolve_project_id(user_id: str, project_id: str) -> tuple[str | None, dict[str, Any] | None]:
    raw = str(project_id).strip()
    if _looks_like_placeholder(raw):
        return None, _error(
            f"Invalid project_id '{raw}'. Call list_user_projects first and pass the exact UUID from projects[].id. Do not use placeholders, slugs, or invented values.",
            code="invalid_project_id",
        )

    if _is_valid_uuid(raw):
        return raw, None

    projects = _user_projects(user_id)
    needle = _normalize_name(raw)
    matches: list[dict[str, Any]] = []
    for project in projects:
        nombre = project.get("nombre") or ""
        normalized = _normalize_name(nombre)
        if (
            raw.lower() in nombre.lower()
            or nombre.lower() in raw.lower()
            or normalized == needle
            or needle in normalized
        ):
            matches.append(project)

    if len(matches) == 1:
        return str(matches[0]["id"]), None

    if len(matches) > 1:
        return None, _error(
            f"Multiple projects match '{raw}'. Use list_user_projects and pass a specific id UUID.",
            code="ambiguous_project",
            matches=[{"id": p["id"], "nombre": p.get("nombre")} for p in matches],
        )

    return None, _error(
        f"No project found for '{raw}'. Call list_user_projects and use projects[].id (UUID).",
        code="project_not_found",
        available_projects=[{"id": p["id"], "nombre": p.get("nombre")} for p in projects],
    )


def _require_project_id(user_id: str, project_id: str, access_token: str | None = None) -> tuple[str | None, dict[str, Any] | None]:
    resolved, err = _resolve_project_id(user_id, project_id)
    if err:
        return None, err
    assert resolved is not None
    try:
        _assert_project_access(user_id, resolved, access_token)
    except PermissionError as exc:
        return None, _error(str(exc), code="forbidden")
    return resolved, None


def list_user_projects(user_id: str, access_token: str | None = None) -> dict[str, Any]:
    del access_token

    def _impl():
        projects = _user_projects(user_id)
        return _ok(
            user_id=user_id,
            count=len(projects),
            projects=projects,
            hint="Use projects[].id (UUID) as project_id in other tools. Example: cd8d71f7-5de1-4f49-a2c3-5ebf56773c67",
        )

    return _run("list_user_projects", _impl)


def get_project_summary(user_id: str, project_id: str, access_token: str | None = None) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("select * from projects where id = %s limit 1", (pid,))
                project = cur.fetchone()
                if not project:
                    return _error(f"Project {pid} not found.")

                cur.execute("select count(*) as c from project_phases where project_id = %s", (pid,))
                phase_count = int((cur.fetchone() or {}).get("c", 0))

                cur.execute(
                    """
                    select count(*) as c
                    from activities a
                    join project_phases ph on ph.id = a.phase_id
                    where ph.project_id = %s
                    """,
                    (pid,),
                )
                activity_count = int((cur.fetchone() or {}).get("c", 0))

                cur.execute(
                    """
                    select coalesce(avg(a.progress_percentage), 0) as avg_progress
                    from activities a
                    join project_phases ph on ph.id = a.phase_id
                    where ph.project_id = %s
                    """,
                    (pid,),
                )
                avg_progress = float((cur.fetchone() or {}).get("avg_progress", 0) or 0)

                cur.execute(
                    "select count(*) as c from incidents where project_id = %s and estado = 'abierto'",
                    (pid,),
                )
                open_incidents = int((cur.fetchone() or {}).get("c", 0))

                cur.execute(
                    """
                    select id, fecha, personal_presente
                    from daily_reports
                    where project_id = %s
                    order by fecha desc
                    limit 1
                    """,
                    (pid,),
                )
                latest_report = cur.fetchone()

                cur.execute(
                    """
                    select id, version_number, estado, total_budget, snapshot_date
                    from budget_snapshots
                    where project_id = %s
                    order by version_number desc
                    limit 1
                    """,
                    (pid,),
                )
                latest_budget = cur.fetchone()
            conn.commit()

        return _ok(
            project=project,
            metrics={
                "phase_count": phase_count,
                "activity_count": activity_count,
                "average_progress_percentage": round(avg_progress, 2),
                "open_incidents": open_incidents,
                "latest_daily_report": latest_report,
                "latest_budget_snapshot": latest_budget,
            },
        )

    return _run("get_project_summary", _impl)


def get_project_budget_status(
    user_id: str,
    project_id: str,
    budget_snapshot_id: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        with get_conn() as conn:
            with conn.cursor() as cur:
                if budget_snapshot_id:
                    cur.execute(
                        """
                        select *
                        from budget_snapshots
                        where id = %s and project_id = %s
                        limit 1
                        """,
                        (budget_snapshot_id, pid),
                    )
                else:
                    cur.execute(
                        """
                        select *
                        from budget_snapshots
                        where project_id = %s
                        order by version_number desc
                        limit 1
                        """,
                        (pid,),
                    )
                snapshot = cur.fetchone()
                if not snapshot:
                    conn.commit()
                    return _ok(
                        project_id=pid,
                        snapshot=None,
                        items=[],
                        message="No budget snapshots found for this project.",
                    )

                cur.execute(
                    """
                    select
                      bsi.id,
                      bsi.cantidad_planeada,
                      bsi.precio_unitario,
                      bsi.subtotal,
                      aps.id as activity_supply_id,
                      aps.activity_id,
                      aps.supply_id,
                      sc.nombre as supply_nombre,
                      sc.unidad_medida as supply_unidad_medida
                    from budget_snapshot_items bsi
                    join activity_supplies aps on aps.id = bsi.activity_supply_id
                    left join supply_catalog sc on sc.id = aps.supply_id
                    where bsi.budget_snapshot_id = %s
                    """,
                    (snapshot["id"],),
                )
                item_rows = cur.fetchall()
            conn.commit()

        items = []
        for row in item_rows:
            items.append(
                {
                    "id": row["id"],
                    "cantidad_planeada": row["cantidad_planeada"],
                    "precio_unitario": row["precio_unitario"],
                    "subtotal": row["subtotal"],
                    "activity_supplies": {
                        "id": row["activity_supply_id"],
                        "activity_id": row["activity_id"],
                        "supply_id": row["supply_id"],
                        "supply_catalog": {
                            "nombre": row.get("supply_nombre"),
                            "unidad_medida": row.get("supply_unidad_medida"),
                        },
                    },
                },
            )

        return _ok(
            project_id=pid,
            snapshot=snapshot,
            item_count=len(items),
            items=items,
        )

    return _run("get_project_budget_status", _impl)


def get_project_supply_selection_inputs(
    user_id: str,
    project_id: str,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, project_id, created_by_profile_id, status, merged_preview, created_at, updated_at
                    from project_input_batches
                    where project_id = %s
                    order by created_at desc
                    limit 1
                    """,
                    (pid,),
                )
                batch = cur.fetchone()
                if not batch:
                    conn.commit()
                    return _ok(project_id=pid, batch=None, normalized_supplies=[], documents=[])

                batch_id = batch["id"]
                cur.execute(
                    """
                    select
                      d.id,
                      d.filename,
                      d.source,
                      d.parse_status,
                      d.confidence,
                      d.content_hash,
                      d.extracted_row_count,
                      d.sheet_names,
                      d.created_at
                    from project_input_documents d
                    where d.input_batch_id = %s
                    order by d.created_at asc
                    """,
                    (batch_id,),
                )
                documents = cur.fetchall()

                cur.execute(
                    """
                    select
                      s.id,
                      s.normalization_key,
                      s.display_name,
                      s.normalized_name,
                      s.normalized_unit,
                      s.normalized_category,
                      s.quantity_total,
                      s.unit_price_reference,
                      s.total_price_reference,
                      s.row_count,
                      s.source_count,
                      s.source_document_ids,
                      coalesce(
                        array_agg(rn.extracted_row_id::text order by rn.created_at)
                          filter (where rn.extracted_row_id is not null),
                        '{}'
                      ) as extracted_row_ids
                    from project_input_normalized_supplies s
                    left join project_input_row_normalizations rn
                      on rn.normalized_supply_id = s.id
                    where s.input_batch_id = %s
                    group by s.id
                    order by s.display_name asc
                    """,
                    (batch_id,),
                )
                normalized_supplies = cur.fetchall()
            conn.commit()

        return _ok(
            project_id=pid,
            batch=batch,
            documents=documents,
            normalized_supplies=normalized_supplies,
        )

    return _run("get_project_supply_selection_inputs", _impl)


def _project_id_for_activity(activity_id: str) -> str:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select ph.project_id
                from activities a
                join project_phases ph on ph.id = a.phase_id
                where a.id = %s
                limit 1
                """,
                (activity_id,),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ValueError(f"Activity {activity_id} not found.")
    return str(row["project_id"])


def list_project_phases_and_activities(
    user_id: str,
    project_id: str,
    phase_id: str | None = None,
    search: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        with get_conn() as conn:
            with conn.cursor() as cur:
                phase_sql = """
                    select id, nombre, descripcion, sort_order
                    from project_phases
                    where project_id = %s
                """
                params: list[Any] = [pid]
                if phase_id:
                    phase_sql += " and id = %s"
                    params.append(phase_id)
                phase_sql += " order by sort_order asc, created_at asc"
                cur.execute(phase_sql, tuple(params))
                phase_rows = cur.fetchall()

                cur.execute(
                    """
                    select
                      a.id,
                      a.phase_id,
                      a.nombre,
                      a.descripcion,
                      a.unidad_medida,
                      a.cantidad_planeada,
                      a.cantidad_ejecutada,
                      a.progress_percentage,
                      a.sort_order
                    from activities a
                    join project_phases ph on ph.id = a.phase_id
                    where ph.project_id = %s
                    order by a.sort_order asc, a.created_at asc
                    """,
                    (pid,),
                )
                activity_rows = cur.fetchall()
            conn.commit()

        activities_by_phase: dict[str, list[dict[str, Any]]] = {}
        for row in activity_rows:
            activity = dict(row)
            activities_by_phase.setdefault(str(row["phase_id"]), []).append(activity)

        phases: list[dict[str, Any]] = []
        for row in phase_rows:
            phase = dict(row)
            phase["activities"] = activities_by_phase.get(str(row["id"]), [])
            phases.append(phase)

        if search:
            term = search.lower()
            filtered: list[dict[str, Any]] = []
            for phase in phases:
                acts = phase.get("activities") or []
                matching = [
                    a
                    for a in acts
                    if term in (a.get("nombre") or "").lower()
                ]
                if matching or term in (phase.get("nombre") or "").lower():
                    filtered.append({**phase, "activities": matching or acts})
            phases = filtered

        return _ok(project_id=pid, phase_count=len(phases), phases=phases)

    return _run("list_project_phases_and_activities", _impl)


def get_activity_detail(
    user_id: str,
    activity_id: str,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid = _project_id_for_activity(activity_id)
        _assert_project_access(user_id, pid, access_token)

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      a.*,
                      ph.id as phase_id,
                      ph.nombre as phase_nombre,
                      ph.project_id,
                      p.id as project_ref_id,
                      p.nombre as project_nombre
                    from activities a
                    join project_phases ph on ph.id = a.phase_id
                    join projects p on p.id = ph.project_id
                    where a.id = %s
                    limit 1
                    """,
                    (activity_id,),
                )
                activity_row = cur.fetchone()
                if not activity_row:
                    return _error(f"Activity {activity_id} not found.")

                cur.execute(
                    """
                    select
                      aps.id,
                      aps.activity_id,
                      aps.supply_id,
                      aps.cantidad_planeada,
                      aps.cantidad_ejecutada,
                      aps.precio_unitario,
                      aps.subtotal,
                      sc.id as catalog_id,
                      sc.nombre as catalog_nombre,
                      sc.unidad_medida as catalog_unidad_medida,
                      sc.tipo as catalog_tipo,
                      sc.precio_referencia as catalog_precio_referencia,
                      sc.disponibilidad as catalog_disponibilidad
                    from activity_supplies aps
                    left join supply_catalog sc on sc.id = aps.supply_id
                    where aps.activity_id = %s
                    order by aps.created_at asc
                    """,
                    (activity_id,),
                )
                supply_rows = cur.fetchall()
            conn.commit()

        activity = dict(activity_row)
        phase_id = activity.pop("phase_id")
        phase_nombre = activity.pop("phase_nombre")
        project_id = activity.pop("project_id")
        project_ref_id = activity.pop("project_ref_id")
        project_nombre = activity.pop("project_nombre")
        activity["project_phases"] = {
            "id": phase_id,
            "nombre": phase_nombre,
            "project_id": project_id,
            "projects": {
                "id": project_ref_id,
                "nombre": project_nombre,
            },
        }

        supplies = []
        for row in supply_rows:
            supply = {
                "id": row["id"],
                "cantidad_planeada": row["cantidad_planeada"],
                "cantidad_ejecutada": row["cantidad_ejecutada"],
                "precio_unitario": row["precio_unitario"],
                "subtotal": row["subtotal"],
                "supply_catalog": {
                    "id": row.get("catalog_id"),
                    "nombre": row.get("catalog_nombre"),
                    "unidad_medida": row.get("catalog_unidad_medida"),
                    "tipo": row.get("catalog_tipo"),
                    "precio_referencia": row.get("catalog_precio_referencia"),
                    "disponibilidad": row.get("catalog_disponibilidad"),
                },
            }
            supplies.append(supply)

        return _ok(activity=activity, supplies=supplies, supply_count=len(supplies))

    return _run("get_activity_detail", _impl)


def list_daily_reports(
    user_id: str,
    project_id: str,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    limit: int = 20,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select
              id, fecha, clima, personal_presente, avance_narrativo, creado_por, created_at
            from daily_reports
            where project_id = %s
        """
        params: list[Any] = [pid]
        if fecha_desde:
            sql += " and fecha >= %s"
            params.append(fecha_desde)
        if fecha_hasta:
            sql += " and fecha <= %s"
            params.append(fecha_hasta)
        sql += " order by fecha desc limit %s"
        params.append(min(limit, 100))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                reports = cur.fetchall()
            conn.commit()
        return _ok(project_id=pid, count=len(reports), reports=reports)

    return _run("list_daily_reports", _impl)


def get_daily_report_detail(
    user_id: str,
    daily_report_id: str | None = None,
    project_id: str | None = None,
    fecha: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        with get_conn() as conn:
            with conn.cursor() as cur:
                if daily_report_id:
                    cur.execute(
                        "select * from daily_reports where id = %s limit 1",
                        (daily_report_id,),
                    )
                elif project_id and fecha:
                    pid, err = _require_project_id(user_id, project_id, access_token)
                    if err:
                        conn.commit()
                        return err
                    cur.execute(
                        """
                        select *
                        from daily_reports
                        where project_id = %s and fecha = %s
                        limit 1
                        """,
                        (pid, fecha),
                    )
                else:
                    conn.commit()
                    return _error(
                        "Provide daily_report_id or both project_id and fecha (YYYY-MM-DD)."
                    )
                report = cur.fetchone()
                if not report:
                    conn.commit()
                    return _error("Daily report not found.")

                _assert_project_access(user_id, str(report["project_id"]), access_token)
                cur.execute(
                    """
                    select
                      dri.id,
                      dri.cantidad_ejecutada,
                      dri.observaciones,
                      a.id as activity_id,
                      a.nombre as activity_nombre,
                      a.unidad_medida as activity_unidad_medida
                    from daily_report_items dri
                    left join activities a on a.id = dri.activity_id
                    where dri.daily_report_id = %s
                    order by dri.created_at asc
                    """,
                    (report["id"],),
                )
                item_rows = cur.fetchall()
            conn.commit()

        items = []
        for row in item_rows:
            items.append(
                {
                    "id": row["id"],
                    "cantidad_ejecutada": row["cantidad_ejecutada"],
                    "observaciones": row.get("observaciones"),
                    "activities": {
                        "id": row.get("activity_id"),
                        "nombre": row.get("activity_nombre"),
                        "unidad_medida": row.get("activity_unidad_medida"),
                    },
                }
            )

        return _ok(report=report, items=items, item_count=len(items))

    return _run("get_daily_report_detail", _impl)


def list_project_incidents(
    user_id: str,
    project_id: str,
    estado: str | None = None,
    severidad: str | None = None,
    solo_abiertos: bool = False,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select
              i.id,
              i.project_id,
              i.tipo,
              i.descripcion,
              i.severidad,
              i.estado,
              i.fecha_ocurrencia,
              i.fecha_cierre,
              i.activity_id,
              i.reportado_por,
              a.nombre as activity_nombre
            from incidents i
            left join activities a on a.id = i.activity_id
            where i.project_id = %s
        """
        params: list[Any] = [pid]
        if solo_abiertos:
            sql += " and i.estado = %s"
            params.append("abierto")
        elif estado:
            sql += " and i.estado = %s"
            params.append(estado)
        if severidad:
            sql += " and i.severidad = %s"
            params.append(severidad)
        sql += " order by i.fecha_ocurrencia desc, i.created_at desc"

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                incident_rows = cur.fetchall()
                incident_ids = [row["id"] for row in incident_rows]
                action_rows: list[dict[str, Any]] = []
                if incident_ids:
                    cur.execute(
                        """
                        select id, incident_id, estado
                        from incident_actions
                        where incident_id = any(%s)
                        order by created_at asc
                        """,
                        (incident_ids,),
                    )
                    action_rows = cur.fetchall()
            conn.commit()

        actions_by_incident: dict[str, list[dict[str, Any]]] = {}
        for row in action_rows:
            actions_by_incident.setdefault(str(row["incident_id"]), []).append(
                {"id": row["id"], "estado": row.get("estado")}
            )

        incidents = []
        for row in incident_rows:
            incident = dict(row)
            incident["activities"] = {"nombre": row.get("activity_nombre")}
            incident["incident_actions"] = actions_by_incident.get(str(row["id"]), [])
            incident.pop("activity_nombre", None)
            incidents.append(incident)

        return _ok(project_id=pid, count=len(incidents), incidents=incidents)

    return _run("list_project_incidents", _impl)


def get_incident_detail(
    user_id: str,
    incident_id: str,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      i.*,
                      a.id as activity_ref_id,
                      a.nombre as activity_nombre
                    from incidents i
                    left join activities a on a.id = i.activity_id
                    where i.id = %s
                    limit 1
                    """,
                    (incident_id,),
                )
                incident_row = cur.fetchone()
                if not incident_row:
                    conn.commit()
                    return _error(f"Incident {incident_id} not found.")

                _assert_project_access(
                    user_id,
                    str(incident_row["project_id"]),
                    access_token,
                )
                cur.execute(
                    """
                    select
                      id,
                      descripcion,
                      responsable_id,
                      fecha_compromiso,
                      fecha_completada,
                      estado
                    from incident_actions
                    where incident_id = %s
                    order by created_at asc
                    """,
                    (incident_id,),
                )
                actions = cur.fetchall()
            conn.commit()

        incident = dict(incident_row)
        incident["activities"] = {
            "id": incident.pop("activity_ref_id", None),
            "nombre": incident.pop("activity_nombre", None),
        }
        return _ok(incident=incident, actions=actions, action_count=len(actions))

    return _run("get_incident_detail", _impl)


def get_supply_catalog_search(
    user_id: str,
    query: str,
    tipo: str | None = None,
    solo_criticos: bool = False,
    limit: int = 25,
    access_token: str | None = None,
) -> dict[str, Any]:
    del user_id
    del access_token

    def _impl():
        sql = """
            select *
            from supply_catalog
            where activo = true
              and nombre ilike %s
        """
        params: list[Any] = [f"%{query}%"]
        if tipo:
            sql += " and tipo = %s"
            params.append(tipo)
        if solo_criticos:
            sql += " and es_critico = true"
        sql += " order by nombre asc limit %s"
        params.append(min(limit, 50))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                supplies = cur.fetchall()
                alerts: list[dict[str, Any]] = []
                supply_ids = [row["id"] for row in supplies]
                if supply_ids:
                    cur.execute(
                        """
                        select *
                        from supply_availability_alerts
                        where supply_id = any(%s)
                          and estado = 'abierta'
                        order by created_at desc
                        """,
                        (supply_ids,),
                    )
                    alerts = cur.fetchall()
            conn.commit()

        return _ok(query=query, count=len(supplies), supplies=supplies, open_alerts=alerts)

    return _run("get_supply_catalog_search", _impl)


def _get_schedule_baseline(
    pid: str,
    schedule_baseline_id: str | None = None,
) -> dict[str, Any] | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            if schedule_baseline_id:
                cur.execute(
                    """
                    select *
                    from schedule_baselines
                    where id = %s and project_id = %s
                    limit 1
                    """,
                    (schedule_baseline_id, pid),
                )
            else:
                cur.execute(
                    """
                    select *
                    from schedule_baselines
                    where project_id = %s
                    order by fecha_creacion desc
                    limit 1
                    """,
                    (pid,),
                )
            row = cur.fetchone()
        conn.commit()
    return row


def get_schedule_status(
    user_id: str,
    project_id: str,
    schedule_baseline_id: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        from datetime import date

        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        baseline = _get_schedule_baseline(pid, schedule_baseline_id)
        if not baseline:
            return _ok(
                project_id=pid,
                baseline=None,
                items=[],
                message="No schedule baseline found for this project.",
            )

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      si.id,
                      si.fecha_inicio_planeada,
                      si.fecha_fin_planeada,
                      si.fecha_inicio_real,
                      si.fecha_fin_real,
                      si.progress_percentage,
                      si.estado,
                      a.id as activity_id,
                      a.nombre as activity_nombre,
                      a.progress_percentage as activity_progress_percentage
                    from schedule_items si
                    left join activities a on a.id = si.activity_id
                    where si.schedule_baseline_id = %s
                    order by si.created_at asc
                    """,
                    (baseline["id"],),
                )
                item_rows = cur.fetchall()
            conn.commit()

        today = date.today().isoformat()
        items = []
        overdue_count = 0
        for row in item_rows:
            item = dict(row)
            if (
                item.get("fecha_fin_planeada")
                and str(item["fecha_fin_planeada"]) < today
                and not item.get("fecha_fin_real")
            ):
                overdue_count += 1
            item["activities"] = {
                "id": row.get("activity_id"),
                "nombre": row.get("activity_nombre"),
                "progress_percentage": row.get("activity_progress_percentage"),
            }
            item.pop("activity_id", None)
            item.pop("activity_nombre", None)
            item.pop("activity_progress_percentage", None)
            items.append(item)

        return _ok(
            project_id=pid,
            baseline=baseline,
            item_count=len(items),
            overdue_count=overdue_count,
            items=items,
        )

    return _run("get_schedule_status", _impl)


def list_overdue_schedule_items(
    user_id: str,
    project_id: str,
    schedule_baseline_id: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        from datetime import date

        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        baseline = _get_schedule_baseline(pid, schedule_baseline_id)
        if not baseline:
            return _ok(project_id=pid, baseline=None, count=0, items=[])

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      si.id,
                      si.fecha_inicio_planeada,
                      si.fecha_fin_planeada,
                      si.fecha_inicio_real,
                      si.fecha_fin_real,
                      si.progress_percentage,
                      si.estado,
                      a.id as activity_id,
                      a.nombre as activity_nombre
                    from schedule_items si
                    left join activities a on a.id = si.activity_id
                    where si.schedule_baseline_id = %s
                    order by si.created_at asc
                    """,
                    (baseline["id"],),
                )
                item_rows = cur.fetchall()
            conn.commit()

        today = date.today().isoformat()
        overdue = []
        for row in item_rows:
            if (
                row.get("fecha_fin_planeada")
                and str(row["fecha_fin_planeada"]) < today
                and not row.get("fecha_fin_real")
            ):
                item = dict(row)
                item["activities"] = {
                    "id": row.get("activity_id"),
                    "nombre": row.get("activity_nombre"),
                }
                item.pop("activity_id", None)
                item.pop("activity_nombre", None)
                overdue.append(item)

        return _ok(
            project_id=pid,
            baseline_id=baseline["id"],
            count=len(overdue),
            items=overdue,
        )

    return _run("list_overdue_schedule_items", _impl)


def list_purchase_orders(
    user_id: str,
    project_id: str,
    estado: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select
              po.*,
              s.id as supplier_id,
              s.nombre as supplier_nombre,
              s.nit_rut as supplier_nit_rut
            from purchase_orders po
            left join suppliers s on s.id = po.supplier_id
            where po.project_id = %s
        """
        params: list[Any] = [pid]
        if estado:
            sql += " and po.estado = %s"
            params.append(estado)
        sql += " order by po.fecha_emision desc, po.created_at desc"

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                orders = cur.fetchall()
                order_ids = [row["id"] for row in orders]
                item_rows: list[dict[str, Any]] = []
                if order_ids:
                    cur.execute(
                        """
                        select
                          id, purchase_order_id, cantidad, precio_unitario, subtotal, es_prioritario
                        from purchase_order_items
                        where purchase_order_id = any(%s)
                        order by created_at asc
                        """,
                        (order_ids,),
                    )
                    item_rows = cur.fetchall()
            conn.commit()

        items_by_order: dict[str, list[dict[str, Any]]] = {}
        for row in item_rows:
            item = dict(row)
            order_id = str(item.pop("purchase_order_id"))
            items_by_order.setdefault(order_id, []).append(item)

        purchase_orders = []
        for row in orders:
            order = dict(row)
            order["suppliers"] = {
                "id": row.get("supplier_id"),
                "nombre": row.get("supplier_nombre"),
                "nit_rut": row.get("supplier_nit_rut"),
            }
            order["purchase_order_items"] = items_by_order.get(str(row["id"]), [])
            order.pop("supplier_id", None)
            order.pop("supplier_nombre", None)
            order.pop("supplier_nit_rut", None)
            purchase_orders.append(order)

        return _ok(project_id=pid, count=len(purchase_orders), purchase_orders=purchase_orders)

    return _run("list_purchase_orders", _impl)


def get_purchase_order_detail(
    user_id: str,
    purchase_order_id: str,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select
                      po.*,
                      s.id as supplier_id,
                      s.nombre as supplier_nombre,
                      s.nit_rut as supplier_nit_rut,
                      s.contacto as supplier_contacto,
                      s.telefono as supplier_telefono,
                      s.email as supplier_email
                    from purchase_orders po
                    left join suppliers s on s.id = po.supplier_id
                    where po.id = %s
                    limit 1
                    """,
                    (purchase_order_id,),
                )
                order_row = cur.fetchone()
                if not order_row:
                    conn.commit()
                    return _error(f"Purchase order {purchase_order_id} not found.")

                _assert_project_access(
                    user_id,
                    str(order_row["project_id"]),
                    access_token,
                )
                cur.execute(
                    """
                    select
                      poi.id,
                      poi.cantidad,
                      poi.precio_unitario,
                      poi.subtotal,
                      poi.es_prioritario,
                      sc.id as supply_catalog_id,
                      sc.nombre as supply_catalog_nombre,
                      sc.unidad_medida as supply_catalog_unidad_medida
                    from purchase_order_items poi
                    left join supply_catalog sc on sc.id = poi.supply_id
                    where poi.purchase_order_id = %s
                    order by poi.created_at asc
                    """,
                    (purchase_order_id,),
                )
                item_rows = cur.fetchall()
                cur.execute(
                    """
                    select
                      id, monto, fecha_pago, metodo_pago, estado, comprobante_url
                    from supplier_payments
                    where purchase_order_id = %s
                    order by fecha_pago desc nulls last, created_at desc
                    """,
                    (purchase_order_id,),
                )
                payments = cur.fetchall()
            conn.commit()

        purchase_order = dict(order_row)
        supplier = {
            "id": purchase_order.pop("supplier_id", None),
            "nombre": purchase_order.pop("supplier_nombre", None),
            "nit_rut": purchase_order.pop("supplier_nit_rut", None),
            "contacto": purchase_order.pop("supplier_contacto", None),
            "telefono": purchase_order.pop("supplier_telefono", None),
            "email": purchase_order.pop("supplier_email", None),
        }
        items = []
        for row in item_rows:
            item = {
                "id": row["id"],
                "cantidad": row["cantidad"],
                "precio_unitario": row["precio_unitario"],
                "subtotal": row["subtotal"],
                "es_prioritario": row.get("es_prioritario"),
                "supply_catalog": {
                    "id": row.get("supply_catalog_id"),
                    "nombre": row.get("supply_catalog_nombre"),
                    "unidad_medida": row.get("supply_catalog_unidad_medida"),
                },
            }
            items.append(item)

        return _ok(
            purchase_order=purchase_order,
            supplier=supplier,
            items=items,
            payments=payments,
            item_count=len(items),
            payment_count=len(payments),
        )

    return _run("get_purchase_order_detail", _impl)


def search_suppliers(
    user_id: str,
    query: str,
    solo_activos: bool = True,
    limit: int = 25,
    access_token: str | None = None,
) -> dict[str, Any]:
    del user_id
    del access_token

    def _impl():
        sql = """
            select *
            from suppliers
            where nombre ilike %s
        """
        params: list[Any] = [f"%{query}%"]
        if solo_activos:
            sql += " and activo = true"
        sql += " order by nombre asc limit %s"
        params.append(min(limit, 50))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                suppliers = cur.fetchall()
            conn.commit()
        return _ok(query=query, count=len(suppliers), suppliers=suppliers)

    return _run("search_suppliers", _impl)


def list_payroll_periods(
    user_id: str,
    project_id: str,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, fecha_inicio, fecha_fin, created_at
                    from payroll_periods
                    where project_id = %s
                    order by fecha_inicio desc, created_at desc
                    """,
                    (pid,),
                )
                periods = cur.fetchall()
            conn.commit()
        return _ok(project_id=pid, count=len(periods), payroll_periods=periods)

    return _run("list_payroll_periods", _impl)


def get_payroll_period_detail(
    user_id: str,
    payroll_period_id: str,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select *
                    from payroll_periods
                    where id = %s
                    limit 1
                    """,
                    (payroll_period_id,),
                )
                period = cur.fetchone()
                if not period:
                    conn.commit()
                    return _error(f"Payroll period {payroll_period_id} not found.")

                _assert_project_access(user_id, str(period["project_id"]), access_token)
                cur.execute(
                    """
                    select
                      pe.id,
                      pe.salario_base,
                      pe.deducciones,
                      pe.bonificaciones,
                      pe.total_neto,
                      pr.id as profile_id,
                      pr.full_name,
                      pr.email,
                      pr.job_title
                    from payroll_entries pe
                    left join profiles pr on pr.id = pe.profile_id
                    where pe.payroll_period_id = %s
                    order by pe.created_at asc
                    """,
                    (payroll_period_id,),
                )
                entry_rows = cur.fetchall()
            conn.commit()

        entries = []
        total_neto = 0.0
        for row in entry_rows:
            total_neto += float(row.get("total_neto") or 0)
            entries.append(
                {
                    "id": row["id"],
                    "salario_base": row.get("salario_base"),
                    "deducciones": row.get("deducciones"),
                    "bonificaciones": row.get("bonificaciones"),
                    "total_neto": row.get("total_neto"),
                    "profiles": {
                        "id": row.get("profile_id"),
                        "full_name": row.get("full_name"),
                        "email": row.get("email"),
                        "job_title": row.get("job_title"),
                    },
                }
            )

        return _ok(
            payroll_period=period,
            entries=entries,
            entry_count=len(entries),
            total_neto=round(total_neto, 2),
        )

    return _run("get_payroll_period_detail", _impl)


def list_project_team(
    user_id: str,
    project_id: str,
    solo_activos: bool = True,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select
              pm.id,
              pm.role,
              pm.active,
              pm.assigned_at,
              pr.id as profile_id,
              pr.full_name,
              pr.email,
              pr.phone,
              pr.job_title,
              pr.active as profile_active
            from project_memberships pm
            left join profiles pr on pr.id = pm.profile_id
            where pm.project_id = %s
        """
        params: list[Any] = [pid]
        if solo_activos:
            sql += " and pm.active = true"
        sql += " order by pm.assigned_at asc nulls last, pm.created_at asc"

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                member_rows = cur.fetchall()
            conn.commit()

        members = []
        for row in member_rows:
            member = {
                "id": row["id"],
                "role": row.get("role"),
                "active": row.get("active"),
                "assigned_at": row.get("assigned_at"),
                "profiles": {
                    "id": row.get("profile_id"),
                    "full_name": row.get("full_name"),
                    "email": row.get("email"),
                    "phone": row.get("phone"),
                    "job_title": row.get("job_title"),
                    "active": row.get("profile_active"),
                },
            }
            members.append(member)

        return _ok(project_id=pid, count=len(members), team=members)

    return _run("list_project_team", _impl)
