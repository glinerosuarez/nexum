from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from .project_input_batches import bind_input_batch_to_project

ALLOWED_PROJECT_STATES = {
    "planificacion",
    "en_ejecucion",
    "pausado",
    "finalizado",
    "cancelado",
}

ROLE_BY_EMAIL: dict[str, str] = {
    "directora.proyecto@example.com": "director_proyecto",
    "residente.obra@example.com": "residente_obra",
    "residente.admin@example.com": "residente_administrativo",
}

SUPPLY_SOURCE_TEMPLATES: dict[str, dict[str, Any]] = {
    "concreto 3000 psi": {
        "source_name": "fred_cement",
        "source_url": "https://fred.stlouisfed.org/series/WPU0573",
        "parse_config": {
            "provider": "fred",
            "series_id": "WPU0573",
            "series_key": "cement",
            "label": "PPI: Cement (US market proxy)",
            "price_unit": "index",
            "keywords": ["cemento", "cement", "concreto", "concrete"],
        },
    },
    "acero corrugado #5": {
        "source_name": "fred_steel",
        "source_url": "https://fred.stlouisfed.org/series/WPU101707",
        "parse_config": {
            "provider": "fred",
            "series_id": "WPU101707",
            "series_key": "steel",
            "label": "PPI: Iron and steel (US market proxy)",
            "price_unit": "index",
            "keywords": ["acero", "steel", "varilla", "rebar"],
        },
    },
    "formaleta metalica": {
        "source_name": "fred_steel_formwork",
        "source_url": "https://fred.stlouisfed.org/series/WPU101707",
        "parse_config": {
            "provider": "fred",
            "series_id": "WPU101707",
            "series_key": "steel",
            "label": "PPI: Iron and steel (US market proxy for metal formwork)",
            "price_unit": "index",
            "keywords": ["formaleta", "formwork", "metalica", "steel", "acero"],
        },
    },
}


def clamp_pct(value: Any) -> float:
    try:
        n = float(value)
    except Exception:
        return 0.0
    if n < 0:
        return 0.0
    if n > 100:
        return 100.0
    return n


def safe_money(value: Any) -> float:
    try:
        n = float(value)
    except Exception:
        return 0.0
    return max(0.0, n)


def phase_budget_or_fallback(phase_budget: Any, fallback_per_phase: float) -> float:
    budget = safe_money(phase_budget)
    if budget > 0:
        return budget
    return fallback_per_phase if fallback_per_phase > 0 else 0.0


def _ensure_demo_project_memberships(
    conn: Connection,
    project_id: str,
    creator_profile_id: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute("select id, email from profiles limit 50")
        profiles = cur.fetchall()

        for profile in profiles:
            email = str(profile.get("email") or "").strip().lower()
            role = ROLE_BY_EMAIL.get(email, "director_proyecto")
            cur.execute(
                """
                insert into project_memberships (project_id, profile_id, role, active)
                values (%s, %s, %s, true)
                on conflict (project_id, profile_id)
                do update set role = excluded.role, active = true
                """,
                (project_id, profile["id"], role),
            )

        cur.execute(
            """
            insert into project_memberships (project_id, profile_id, role, active)
            values (%s, %s, 'director_proyecto', true)
            on conflict (project_id, profile_id)
            do update set role = excluded.role, active = true
            """,
            (project_id, creator_profile_id),
        )


def _ensure_bootstrap_critical_supplies(conn: Connection) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, nombre, unidad_medida, coalesce(precio_referencia, 0) as precio_referencia
            from supply_catalog
            where es_critico = true and activo = true
            order by precio_referencia desc
            limit 12
            """,
        )
        existing = cur.fetchall()
        if existing:
            return existing

        fallback = [
            {
                "nombre": "Concreto 3000 PSI",
                "descripcion": "Insumo crítico bootstrap para onboarding de demo.",
                "unidad_medida": "m3",
                "tipo": "material",
                "precio_referencia": 390000,
                "disponibilidad": "disponible",
            },
            {
                "nombre": "Acero corrugado #5",
                "descripcion": "Insumo crítico bootstrap para onboarding de demo.",
                "unidad_medida": "kg",
                "tipo": "material",
                "precio_referencia": 5200,
                "disponibilidad": "escaso",
            },
            {
                "nombre": "Formaleta metalica",
                "descripcion": "Insumo crítico bootstrap para onboarding de demo.",
                "unidad_medida": "m2",
                "tipo": "subcontrato",
                "precio_referencia": 42000,
                "disponibilidad": "agotado",
            },
        ]

        for item in fallback:
            cur.execute(
                """
                insert into supply_catalog (
                  nombre, descripcion, unidad_medida, tipo,
                  precio_referencia, disponibilidad, es_critico, activo
                )
                values (%s, %s, %s, %s, %s, %s, true, true)
                on conflict (nombre)
                do update set
                  descripcion = excluded.descripcion,
                  unidad_medida = excluded.unidad_medida,
                  tipo = excluded.tipo,
                  precio_referencia = excluded.precio_referencia,
                  disponibilidad = excluded.disponibilidad,
                  es_critico = true,
                  activo = true
                """,
                (
                    item["nombre"],
                    item["descripcion"],
                    item["unidad_medida"],
                    item["tipo"],
                    item["precio_referencia"],
                    item["disponibilidad"],
                ),
            )

        cur.execute(
            """
            select id, nombre, unidad_medida, coalesce(precio_referencia, 0) as precio_referencia
            from supply_catalog
            where es_critico = true and activo = true
            order by precio_referencia desc
            limit 12
            """,
        )
        return cur.fetchall()


def _ensure_bootstrap_supply_sources(conn: Connection, supplies: list[dict[str, Any]]) -> None:
    if not supplies:
        return

    supply_ids = [s["id"] for s in supplies]
    mapped_supply_ids: set[str] = set()

    with conn.cursor() as cur:
        cur.execute(
            """
            select supply_id
            from supply_price_sources
            where is_active = true and supply_id = any(%s)
            """,
            (supply_ids,),
        )
        for row in cur.fetchall():
            mapped_supply_ids.add(str(row["supply_id"]))

        for supply in supplies:
            supply_id = str(supply["id"])
            if supply_id in mapped_supply_ids:
                continue

            key = str(supply.get("nombre") or "").lower().strip()
            template = SUPPLY_SOURCE_TEMPLATES.get(key)
            if not template:
                continue

            cur.execute(
                """
                insert into supply_price_sources (
                  supply_id, source_name, source_url, parse_config, is_active, priority
                )
                values (%s, %s, %s, %s::jsonb, true, 1)
                on conflict (supply_id, source_url)
                do update set
                  source_name = excluded.source_name,
                  parse_config = excluded.parse_config,
                  is_active = true,
                  priority = excluded.priority
                """,
                (
                    supply_id,
                    template["source_name"],
                    template["source_url"],
                    json.dumps(template["parse_config"]),
                ),
            )


def _bootstrap_activities_supplies_and_snapshot(
    conn: Connection,
    project_id: str,
    inserted_phases: list[dict[str, Any]],
    project_budget: float,
) -> None:
    if not inserted_phases:
        return

    total_phase_budget = sum(safe_money(ph.get("costo_planeado")) for ph in inserted_phases)
    fallback_per_phase = 0.0
    if total_phase_budget <= 0 and inserted_phases:
        fallback_per_phase = safe_money(project_budget) / len(inserted_phases)

    activities: list[dict[str, Any]] = []
    with conn.cursor() as cur:
        for phase in inserted_phases:
            qty_executed = clamp_pct(phase.get("porcentaje_completado")) / 100
            cur.execute(
                """
                insert into activities (
                  phase_id, nombre, descripcion, unidad_medida,
                  cantidad_planeada, cantidad_ejecutada, sort_order
                )
                values (%s, %s, %s, %s, %s, %s, %s)
                returning id, phase_id
                """,
                (
                    phase["id"],
                    f"Ejecución {phase['nombre']}"[:120],
                    "Actividad base creada desde onboarding contractual.",
                    "global",
                    1,
                    qty_executed,
                    1,
                ),
            )
            row = cur.fetchone()
            if row:
                activities.append(row)

    if not activities:
        return

    critical_supplies = _ensure_bootstrap_critical_supplies(conn)
    _ensure_bootstrap_supply_sources(conn, critical_supplies)

    phase_by_id = {str(ph["id"]): ph for ph in inserted_phases}

    with conn.cursor() as cur:
        for idx, activity in enumerate(activities):
            supply = critical_supplies[idx % len(critical_supplies)]
            phase = phase_by_id.get(str(activity["phase_id"]), {})
            unit_price = max(1.0, safe_money(supply.get("precio_referencia")) or 1.0)
            target_budget = phase_budget_or_fallback(phase.get("costo_planeado"), fallback_per_phase)
            qty_planned_raw = target_budget / unit_price if target_budget > 0 else 1.0
            qty_planned = round(max(0.0001, qty_planned_raw), 4)
            qty_executed = round(qty_planned * (clamp_pct(phase.get("porcentaje_completado")) / 100), 4)

            cur.execute(
                """
                insert into activity_supplies (
                  activity_id, supply_id, cantidad_planeada, cantidad_ejecutada, precio_unitario
                )
                values (%s, %s, %s, %s, %s)
                """,
                (activity["id"], supply["id"], qty_planned, qty_executed, unit_price),
            )

        updated_budget = round(total_phase_budget, 2) if total_phase_budget > 0 else safe_money(project_budget)
        cur.execute(
            "update projects set presupuesto_total = %s where id = %s",
            (updated_budget, project_id),
        )

        cur.execute(
            """
            select coalesce(max(version_number), 0) + 1 as next_version
            from budget_snapshots
            where project_id = %s
            """,
            (project_id,),
        )
        next_version = int((cur.fetchone() or {}).get("next_version") or 1)

        cur.execute(
            """
            select
              aps.id,
              coalesce(aps.cantidad_planeada, 0) as cantidad_planeada,
              coalesce(aps.precio_unitario, 0) as precio_unitario,
              coalesce(aps.subtotal, coalesce(aps.cantidad_planeada, 0) * coalesce(aps.precio_unitario, 0)) as subtotal
            from activity_supplies aps
            join activities a on a.id = aps.activity_id
            join project_phases ph on ph.id = a.phase_id
            where ph.project_id = %s
            """,
            (project_id,),
        )
        apu_rows = cur.fetchall()

        if not apu_rows:
            return

        total_budget = round(sum(safe_money(r.get("subtotal")) for r in apu_rows), 2)

        cur.execute(
            """
            insert into budget_snapshots (
              project_id, version_number, estado, total_budget, notes
            )
            values (%s, %s, %s, %s, %s)
            returning id
            """,
            (
                project_id,
                next_version,
                "borrador",
                total_budget,
                "Snapshot automático creado desde onboarding.",
            ),
        )
        snapshot_row = cur.fetchone()
        if not snapshot_row:
            return

        snapshot_id = snapshot_row["id"]
        for row in apu_rows:
            cur.execute(
                """
                insert into budget_snapshot_items (
                  budget_snapshot_id, activity_supply_id, cantidad_planeada, precio_unitario
                )
                values (%s, %s, %s, %s)
                """,
                (snapshot_id, row["id"], row["cantidad_planeada"], row["precio_unitario"]),
            )


def create_project_with_bootstrap(
    conn: Connection,
    creator_profile_id: str,
    payload: dict[str, Any],
) -> str:
    nombre = str(payload.get("nombre") or "").strip()
    if not nombre:
        raise ValueError("El nombre del proyecto es obligatorio.")

    estado = str(payload.get("estado") or "planificacion").strip()
    if estado not in ALLOWED_PROJECT_STATES:
        estado = "planificacion"

    descripcion = payload.get("descripcion")
    ubicacion = payload.get("ubicacion")
    fecha_inicio_planeada = payload.get("fecha_inicio_planeada")
    fecha_fin_planeada = payload.get("fecha_fin_planeada")
    fecha_inicio_real = payload.get("fecha_inicio_real")
    presupuesto_total = safe_money(payload.get("presupuesto_total"))
    input_batch_id = str(payload.get("input_batch_id") or "").strip() or None

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into projects (
              nombre, descripcion, ubicacion, estado,
              fecha_inicio_planeada, fecha_fin_planeada, fecha_inicio_real,
              presupuesto_total
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            returning id
            """,
            (
                nombre,
                descripcion,
                ubicacion,
                estado,
                fecha_inicio_planeada,
                fecha_fin_planeada,
                fecha_inicio_real,
                presupuesto_total,
            ),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("No pudimos crear el proyecto.")
        project_id = str(row["id"])

    if input_batch_id:
        bind_input_batch_to_project(
            conn,
            created_by_profile_id=creator_profile_id,
            input_batch_id=input_batch_id,
            project_id=project_id,
        )

    _ensure_demo_project_memberships(conn, project_id, creator_profile_id)

    raw_phases = payload.get("phases")
    phases = raw_phases if isinstance(raw_phases, list) else []

    phase_rows = []
    for idx, phase in enumerate(phases):
        if not isinstance(phase, dict):
            continue
        phase_name = str(phase.get("nombre") or "").strip()
        if not phase_name:
            continue

        phase_rows.append(
            {
                "project_id": project_id,
                "nombre": phase_name[:120],
                "descripcion": None,
                "sort_order": int(phase.get("sort_order") or (idx + 1)),
                "fecha_inicio": phase.get("fecha_inicio"),
                "fecha_fin": phase.get("fecha_fin"),
                "costo_planeado": safe_money(phase.get("costo")),
                "costo_real": 0.0,
                "porcentaje_completado": clamp_pct(phase.get("porcentaje_completado")),
            },
        )

    inserted_phases: list[dict[str, Any]] = []
    if phase_rows:
        with conn.cursor() as cur:
            for phase in phase_rows:
                cur.execute(
                    """
                    insert into project_phases (
                      project_id, nombre, descripcion, sort_order,
                      fecha_inicio, fecha_fin, costo_planeado, costo_real,
                      porcentaje_completado
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    returning id, nombre, sort_order, costo_planeado, porcentaje_completado
                    """,
                    (
                        phase["project_id"],
                        phase["nombre"],
                        phase["descripcion"],
                        phase["sort_order"],
                        phase["fecha_inicio"],
                        phase["fecha_fin"],
                        phase["costo_planeado"],
                        phase["costo_real"],
                        phase["porcentaje_completado"],
                    ),
                )
                inserted = cur.fetchone()
                if inserted:
                    inserted_phases.append(inserted)

    if inserted_phases:
        _bootstrap_activities_supplies_and_snapshot(
            conn,
            project_id,
            inserted_phases,
            presupuesto_total,
        )

    return project_id
