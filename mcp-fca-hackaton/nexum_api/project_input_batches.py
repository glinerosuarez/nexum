from __future__ import annotations

import json
from typing import Any

from psycopg import Connection


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, default=str)


def _propagate_project_binding_to_agentic_shadow(
    conn: Connection,
    *,
    input_batch_id: str,
    project_id: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update project_input_agentic_runs
            set project_id = %s, updated_at = now()
            where input_batch_id = %s
              and (project_id is null or project_id = %s)
            """,
            (project_id, input_batch_id, project_id),
        )
        cur.execute(
            """
            update project_input_agentic_candidates
            set project_id = %s, updated_at = now()
            where input_batch_id = %s
              and (project_id is null or project_id = %s)
            """,
            (project_id, input_batch_id, project_id),
        )


def create_project_input_batch(
    conn: Connection,
    *,
    created_by_profile_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    documents = payload.get("documents") or []
    extracted_rows = payload.get("extracted_rows") or []
    normalized_supplies = payload.get("normalized_supplies") or []
    row_normalizations = payload.get("row_normalizations") or []

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into project_input_batches (
              created_by_profile_id,
              status,
              merged_preview
            )
            values (%s, %s, %s::jsonb)
            returning id
            """,
            (
                created_by_profile_id,
                str(payload.get("status") or "analyzed"),
                _json(payload.get("merged_preview") or {}),
            ),
        )
        batch_row = cur.fetchone()
        if not batch_row or not batch_row.get("id"):
            raise RuntimeError("Could not create project input batch.")
        batch_id = str(batch_row["id"])

        document_id_map: dict[str, str] = {}
        for document in documents:
            cur.execute(
                """
                insert into project_input_documents (
                  input_batch_id,
                  filename,
                  source,
                  content_type,
                  byte_size,
                  parse_status,
                  confidence,
                  notes,
                  content_hash,
                  preview,
                  sheet_names,
                  extracted_row_count
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s)
                returning id
                """,
                (
                    batch_id,
                    document.get("filename"),
                    document.get("source"),
                    document.get("content_type"),
                    document.get("byte_size"),
                    document.get("parse_status"),
                    document.get("confidence"),
                    _json(document.get("notes") or []),
                    document.get("content_hash"),
                    _json(document.get("preview") or {}),
                    _json(document.get("sheet_names") or []),
                    int(document.get("extracted_row_count") or 0),
                ),
            )
            row = cur.fetchone()
            if row and row.get("id"):
                document_id_map[str(document.get("client_document_id"))] = str(row["id"])

        extracted_row_id_map: dict[str, str] = {}
        for extracted_row in extracted_rows:
            document_id = document_id_map.get(str(extracted_row.get("client_document_id")))
            if not document_id:
                raise ValueError("Extracted row references unknown client_document_id.")
            cur.execute(
                """
                insert into project_input_extracted_rows (
                  input_batch_id,
                  document_id,
                  source,
                  source_ref,
                  raw_name,
                  raw_unit,
                  raw_category,
                  raw_quantity,
                  raw_unit_price,
                  raw_total_price,
                  normalized_name,
                  normalized_unit,
                  normalized_category,
                  normalization_key,
                  notes,
                  raw_columns
                )
                values (
                  %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb
                )
                returning id
                """,
                (
                    batch_id,
                    document_id,
                    extracted_row.get("source"),
                    _json(extracted_row.get("source_ref") or {}),
                    extracted_row.get("raw_name"),
                    extracted_row.get("raw_unit"),
                    extracted_row.get("raw_category"),
                    extracted_row.get("raw_quantity"),
                    extracted_row.get("raw_unit_price"),
                    extracted_row.get("raw_total_price"),
                    extracted_row.get("normalized_name"),
                    extracted_row.get("normalized_unit"),
                    extracted_row.get("normalized_category"),
                    extracted_row.get("normalization_key"),
                    _json(extracted_row.get("notes") or []),
                    _json(extracted_row.get("raw_columns") or {}),
                ),
            )
            row = cur.fetchone()
            if row and row.get("id"):
                extracted_row_id_map[str(extracted_row.get("client_row_id"))] = str(row["id"])

        normalized_supply_id_map: dict[str, str] = {}
        for normalized_supply in normalized_supplies:
            cur.execute(
                """
                insert into project_input_normalized_supplies (
                  input_batch_id,
                  normalization_key,
                  display_name,
                  normalized_name,
                  normalized_unit,
                  normalized_category,
                  quantity_total,
                  unit_price_reference,
                  total_price_reference,
                  row_count,
                  source_count,
                  source_document_ids
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                returning id
                """,
                (
                    batch_id,
                    normalized_supply.get("client_normalized_key"),
                    normalized_supply.get("display_name"),
                    normalized_supply.get("normalized_name"),
                    normalized_supply.get("normalized_unit"),
                    normalized_supply.get("normalized_category"),
                    normalized_supply.get("quantity_total"),
                    normalized_supply.get("unit_price_reference"),
                    normalized_supply.get("total_price_reference"),
                    int(normalized_supply.get("row_count") or 0),
                    int(normalized_supply.get("source_count") or 0),
                    _json(normalized_supply.get("source_document_ids") or []),
                ),
            )
            row = cur.fetchone()
            if row and row.get("id"):
                normalized_supply_id_map[str(normalized_supply.get("client_normalized_key"))] = str(
                    row["id"]
                )

        for normalization in row_normalizations:
            extracted_row_id = extracted_row_id_map.get(
                str(normalization.get("client_extracted_row_id"))
            )
            normalized_supply_id = normalized_supply_id_map.get(
                str(normalization.get("client_normalized_key"))
            )
            if not extracted_row_id or not normalized_supply_id:
                raise ValueError(
                    "Row normalization references unknown extracted row or normalized supply."
                )
            cur.execute(
                """
                insert into project_input_row_normalizations (
                  input_batch_id,
                  extracted_row_id,
                  normalized_supply_id,
                  normalization_reason
                )
                values (%s, %s, %s, %s)
                """,
                (
                    batch_id,
                    extracted_row_id,
                    normalized_supply_id,
                    normalization.get("normalization_reason"),
                ),
            )

    return {
        "input_batch_id": batch_id,
        "document_id_map": document_id_map,
        "extracted_row_id_map": extracted_row_id_map,
        "normalized_supply_id_map": normalized_supply_id_map,
    }


def bind_input_batch_to_project(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    project_id: str,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, created_by_profile_id, project_id
            from project_input_batches
            where id = %s
            limit 1
            """,
            (input_batch_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("input_batch_id no existe.")
        if str(row.get("created_by_profile_id")) != created_by_profile_id:
            raise ValueError("input_batch_id no pertenece al usuario creador.")
        if row.get("project_id") and str(row.get("project_id")) != project_id:
            raise ValueError("input_batch_id ya está asociado a otro proyecto.")

        cur.execute(
            """
            update project_input_batches
            set project_id = %s, status = %s, updated_at = now()
            where id = %s
            """,
            (project_id, "linked_to_project", input_batch_id),
        )
    _propagate_project_binding_to_agentic_shadow(
        conn,
        input_batch_id=input_batch_id,
        project_id=project_id,
    )


def get_latest_project_input_batch(
    conn: Connection,
    *,
    project_id: str,
) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, project_id, created_by_profile_id, status, merged_preview, created_at, updated_at
            from project_input_batches
            where project_id = %s
            order by created_at desc
            limit 1
            """,
            (project_id,),
        )
        batch = cur.fetchone()
        if not batch:
            return None

        input_batch_id = str(batch["id"])

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
            order by d.created_at asc, d.filename asc
            """,
            (input_batch_id,),
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
                jsonb_agg(rn.extracted_row_id order by rn.extracted_row_id)
                filter (where rn.extracted_row_id is not null),
                '[]'::jsonb
              ) as extracted_row_ids
            from project_input_normalized_supplies s
            left join project_input_row_normalizations rn
              on rn.normalized_supply_id = s.id
            where s.input_batch_id = %s
            group by s.id
            order by s.display_name asc, s.created_at asc
            """,
            (input_batch_id,),
        )
        normalized_supplies = cur.fetchall()

        cur.execute(
            """
            select
              (select count(*) from project_input_documents where input_batch_id = %s) as document_count,
              (select count(*) from project_input_extracted_rows where input_batch_id = %s) as extracted_row_count,
              (select count(*) from project_input_normalized_supplies where input_batch_id = %s) as normalized_supply_count,
              (select count(*) from project_input_row_normalizations where input_batch_id = %s) as row_normalization_count
            """,
            (input_batch_id, input_batch_id, input_batch_id, input_batch_id),
        )
        row_counts = cur.fetchone() or {}

    return {
        "batch": batch,
        "documents": documents,
        "normalized_supplies": normalized_supplies,
        "row_counts": row_counts,
    }
