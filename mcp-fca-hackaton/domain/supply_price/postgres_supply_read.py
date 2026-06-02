"""Cloud SQL read tools for supply price agent persisted data."""

from __future__ import annotations

import logging
from typing import Any

from domain.project.postgres_read import (
    _assert_project_access,
    _error,
    _is_valid_uuid,
    _ok,
    _require_project_id,
    _run,
)
from infra.postgres_client import get_conn

logger = logging.getLogger("mcp-postgres-supply-read")


def _require_run_access(
    user_id: str,
    run_id: str,
    access_token: str | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if not _is_valid_uuid(run_id):
        return None, _error(f"Invalid run_id '{run_id}'.", code="invalid_run_id")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from supply_agent_runs where id = %s limit 1", (run_id,))
            run = cur.fetchone()
        conn.commit()
    if not run:
        return None, _error(f"Run {run_id} not found.", code="not_found")

    project_id = run.get("project_id")
    if not project_id:
        return None, _error("Run has no project_id.", code="invalid_run")

    try:
        _assert_project_access(user_id, str(project_id), access_token)
    except PermissionError as exc:
        return None, _error(str(exc), code="forbidden")
    return run, None


def list_supply_agent_runs(
    user_id: str,
    project_id: str,
    status: str | None = None,
    limit: int = 20,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select *
            from supply_agent_runs
            where project_id = %s
        """
        params: list[Any] = [pid]
        if status:
            sql += " and status = %s"
            params.append(status)
        sql += " order by created_at desc limit %s"
        params.append(min(limit, 100))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                runs = cur.fetchall()
            conn.commit()
        return _ok(project_id=pid, count=len(runs), runs=runs)

    return _run("list_supply_agent_runs", _impl)


def get_supply_agent_run(
    user_id: str,
    run_id: str,
    include_forecasts: bool = False,
    include_alerts: bool = True,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        run, err = _require_run_access(user_id, run_id, access_token)
        if err:
            return err
        assert run is not None

        payload: dict[str, Any] = {"run": run, "project_id": run.get("project_id")}

        if include_alerts or include_forecasts:
            with get_conn() as conn:
                with conn.cursor() as cur:
                    if include_alerts:
                        cur.execute(
                            """
                            select *
                            from supply_cost_overrun_alerts
                            where run_id = %s
                            order by created_at desc
                            """,
                            (run_id,),
                        )
                        alerts = cur.fetchall()
                        payload["alerts"] = alerts
                        payload["alert_count"] = len(alerts)

                    if include_forecasts:
                        cur.execute(
                            """
                            select *
                            from supply_cost_forecasts
                            where run_id = %s
                            order by forecast_date asc
                            """,
                            (run_id,),
                        )
                        forecasts = cur.fetchall()
                        payload["forecasts"] = forecasts
                        payload["forecast_count"] = len(forecasts)
                conn.commit()

        return _ok(**payload)

    return _run("get_supply_agent_run", _impl)


def list_supply_cost_overrun_alerts(
    user_id: str,
    project_id: str,
    status: str | None = None,
    limit: int = 25,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select *
            from supply_cost_overrun_alerts
            where project_id = %s
        """
        params: list[Any] = [pid]
        if status:
            sql += " and status = %s"
            params.append(status)
        sql += " order by created_at desc limit %s"
        params.append(min(limit, 100))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                alerts = cur.fetchall()
            conn.commit()
        return _ok(project_id=pid, count=len(alerts), alerts=alerts)

    return _run("list_supply_cost_overrun_alerts", _impl)


def list_supply_price_observations(
    user_id: str,
    supply_id: str,
    project_id: str,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    limit: int = 100,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        if not _is_valid_uuid(supply_id):
            return _error(f"Invalid supply_id '{supply_id}'.", code="invalid_supply_id")

        pid, err = _require_project_id(user_id, project_id, access_token)
        if err:
            return err

        sql = """
            select
              spo.*,
              sps.id as source_row_id,
              sps.source_name,
              sps.source_url,
              sps.parse_config
            from supply_price_observations spo
            left join supply_price_sources sps on sps.id = spo.source_id
            where spo.project_id = %s
              and spo.supply_id = %s
        """
        params: list[Any] = [pid, supply_id]
        if fecha_desde:
            sql += " and spo.observed_at >= %s"
            params.append(fecha_desde)
        if fecha_hasta:
            sql += " and spo.observed_at <= %s"
            params.append(fecha_hasta)
        sql += " order by spo.observed_at desc limit %s"
        params.append(min(limit, 500))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                rows = cur.fetchall()
            conn.commit()

        observations = []
        for row in rows:
            obs = dict(row)
            obs["supply_price_sources"] = {
                "id": row.get("source_row_id"),
                "source_name": row.get("source_name"),
                "source_url": row.get("source_url"),
                "parse_config": row.get("parse_config"),
            }
            observations.append(obs)

        return _ok(project_id=pid, supply_id=supply_id, count=len(observations), observations=observations)

    return _run("list_supply_price_observations", _impl)


def list_supply_cost_forecasts(
    user_id: str,
    project_id: str | None = None,
    run_id: str | None = None,
    supply_id: str | None = None,
    limit: int = 100,
    access_token: str | None = None,
) -> dict[str, Any]:
    def _impl():
        if not run_id and not supply_id and not project_id:
            return _error(
                "Provide at least one of project_id, run_id, or supply_id.",
                code="invalid_request",
            )

        resolved_project_id = project_id
        if run_id:
            run, err = _require_run_access(user_id, run_id, access_token)
            if err:
                return err
            assert run is not None
            resolved_project_id = str(run.get("project_id"))

        if resolved_project_id:
            pid, err = _require_project_id(user_id, str(resolved_project_id), access_token)
            if err:
                return err
            resolved_project_id = pid
        elif supply_id:
            if not _is_valid_uuid(supply_id):
                return _error(f"Invalid supply_id '{supply_id}'.", code="invalid_supply_id")
            with get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        select project_id
                        from supply_cost_forecasts
                        where supply_id = %s
                        limit 1
                        """,
                        (supply_id,),
                    )
                    sample = cur.fetchone()
                conn.commit()
            if not sample:
                return _ok(count=0, forecasts=[], supply_id=supply_id)
            pid, err = _require_project_id(user_id, str(sample["project_id"]), access_token)
            if err:
                return err
            resolved_project_id = pid

        sql = """
            select *
            from supply_cost_forecasts
            where 1 = 1
        """
        params: list[Any] = []
        if resolved_project_id:
            sql += " and project_id = %s"
            params.append(resolved_project_id)
        if run_id:
            sql += " and run_id = %s"
            params.append(run_id)
        if supply_id:
            sql += " and supply_id = %s"
            params.append(supply_id)
        sql += " order by forecast_date desc limit %s"
        params.append(min(limit, 500))

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                rows = cur.fetchall()
            conn.commit()
        return _ok(
            project_id=resolved_project_id,
            run_id=run_id,
            supply_id=supply_id,
            count=len(rows),
            forecasts=rows,
        )

    return _run("list_supply_cost_forecasts", _impl)


def list_supply_price_sources(
    user_id: str,
    supply_id: str,
    solo_activos: bool = True,
    access_token: str | None = None,
) -> dict[str, Any]:
    del user_id
    del access_token

    def _impl():
        if not _is_valid_uuid(supply_id):
            return _error(f"Invalid supply_id '{supply_id}'.", code="invalid_supply_id")

        sql = """
            select *
            from supply_price_sources
            where supply_id = %s
        """
        params: list[Any] = [supply_id]
        if solo_activos:
            sql += " and is_active = true"
        sql += " order by priority asc"

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(params))
                sources = cur.fetchall()
            conn.commit()
        return _ok(supply_id=supply_id, count=len(sources), sources=sources)

    return _run("list_supply_price_sources", _impl)
