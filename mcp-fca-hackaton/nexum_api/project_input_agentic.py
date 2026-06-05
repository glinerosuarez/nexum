from __future__ import annotations

import json
import re
import unicodedata
import uuid
from collections import Counter
from decimal import Decimal
from typing import Any

from psycopg import Connection

from .project_input_batches import get_latest_project_input_batch


_MATERIAL_KEYWORDS = {
    "acero",
    "aluminio",
    "arena",
    "baldosa",
    "cable",
    "cemento",
    "concreto",
    "fibrocemento",
    "granito",
    "lamina",
    "losa",
    "madera",
    "panel",
    "perno",
    "porcelanato",
    "puerta",
    "tablero",
    "tuberia",
    "varilla",
    "vidrio",
}

_HEADING_HINTS = {
    "acabados",
    "arquitectonicos",
    "arquitectonicos y acabados",
    "capitulo",
    "elementos arquitectonicos",
    "equipos",
    "habitaciones y pasillos",
    "instalaciones electricas",
    "instalaciones hidraulicas",
    "preliminares",
}

_LABOR_KEYWORDS = {
    "ayudante",
    "cuadrilla",
    "instalador",
    "mano de obra",
    "operario",
    "pintor",
    "servicio",
    "soldador",
    "supervision",
}

_SCOPE_KEYWORDS = {
    "adecuacion",
    "adecuacion",
    "aplicacion",
    "demolicion",
    "desmonte",
    "ejecucion",
    "instalacion",
    "instalacion de",
    "limpieza",
    "montaje",
    "pintura",
    "retiro",
}

_BUNDLE_KEYWORDS = {
    "con ",
    "incluye",
    "s / i",
    "s/i",
    "suministro e instalacion",
}


def _json(value: Any, default: Any) -> str:
    payload = default if value is None else value
    return json.dumps(payload, default=str)


def _to_decimal_or_none(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _word_tokens(text: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9#]+", text) if token]


def _looks_heading(raw_text: str, raw_quantity: Any, raw_unit: Any, raw_total_price: Any) -> bool:
    text = str(raw_text or "").strip()
    normalized = _normalize_text(text)
    words = _word_tokens(normalized)
    if not words:
        return False
    has_numeric_signal = raw_quantity not in (None, "") or raw_total_price not in (None, "") or bool(
        str(raw_unit or "").strip()
    )
    letters = [ch for ch in text if ch.isalpha()]
    uppercase_ratio = (
        sum(1 for ch in letters if ch.isupper()) / len(letters) if letters else 0.0
    )
    if normalized in _HEADING_HINTS:
        return True
    if not has_numeric_signal and uppercase_ratio >= 0.75 and len(words) <= 8:
        return True
    if not has_numeric_signal and len(words) <= 5 and any(word in _HEADING_HINTS for word in words):
        return True
    return False


def _contains_any(text: str, phrases: set[str]) -> bool:
    return any(phrase in text for phrase in phrases)


def _has_material_signal(text: str) -> bool:
    words = set(_word_tokens(text))
    return bool(words & _MATERIAL_KEYWORDS)


def _infer_judgment(candidate: dict[str, Any]) -> dict[str, Any]:
    raw_text = str(candidate.get("raw_text") or candidate.get("raw_name") or "").strip()
    normalized = _normalize_text(raw_text)
    raw_quantity = candidate.get("raw_quantity")
    raw_unit = str(candidate.get("raw_unit") or "").strip()
    raw_total_price = candidate.get("raw_total_price")
    has_numeric_signal = raw_quantity not in (None, "") or raw_total_price not in (None, "")
    has_unit_signal = bool(raw_unit)
    has_material_signal = _has_material_signal(normalized)

    evidence_refs = list(candidate.get("evidence_refs") or [])
    evidence_refs.append({"type": "row_text", "value": raw_text})

    section_labels = [str(item) for item in (candidate.get("section_labels") or []) if str(item).strip()]
    for label in section_labels[:2]:
        evidence_refs.append({"type": "section_label", "value": label})

    if _looks_heading(raw_text, raw_quantity, raw_unit, raw_total_price):
        return {
            "judgment_label": "heading_or_chapter",
            "is_qualified": False,
            "is_market_monitorable": False,
            "confidence": "high",
            "rationale_summary": "Candidate appears to be a heading or chapter label instead of a purchasable supply.",
            "evidence_refs": evidence_refs,
        }

    if _contains_any(normalized, _LABOR_KEYWORDS):
        return {
            "judgment_label": "labor_or_service",
            "is_qualified": False,
            "is_market_monitorable": False,
            "confidence": "medium",
            "rationale_summary": "Candidate is labor or service heavy and should not be monitored as a direct market supply.",
            "evidence_refs": evidence_refs,
        }

    if _contains_any(normalized, _BUNDLE_KEYWORDS) and has_material_signal:
        return {
            "judgment_label": "bundle_or_mixed_scope",
            "is_qualified": False,
            "is_market_monitorable": False,
            "confidence": "medium",
            "rationale_summary": "Candidate mixes supply intent with bundled installation or scope language.",
            "evidence_refs": evidence_refs,
        }

    if _contains_any(normalized, _SCOPE_KEYWORDS) and not has_material_signal:
        return {
            "judgment_label": "scope_or_activity",
            "is_qualified": False,
            "is_market_monitorable": False,
            "confidence": "medium",
            "rationale_summary": "Candidate reads like an activity or work scope instead of a discrete purchasable supply.",
            "evidence_refs": evidence_refs,
        }

    if has_material_signal and (has_unit_signal or has_numeric_signal):
        return {
            "judgment_label": "qualified_supply",
            "is_qualified": True,
            "is_market_monitorable": True,
            "confidence": "medium",
            "rationale_summary": "Candidate shows a material-like description with quantity, unit, or price signals.",
            "evidence_refs": evidence_refs,
        }

    if has_unit_signal and has_numeric_signal:
        return {
            "judgment_label": "qualified_supply",
            "is_qualified": True,
            "is_market_monitorable": None,
            "confidence": "low",
            "rationale_summary": "Candidate has tabular supply signals but lacks strong material vocabulary; keep for later normalization review.",
            "evidence_refs": evidence_refs,
        }

    return {
        "judgment_label": "unresolved",
        "is_qualified": False,
        "is_market_monitorable": None,
        "confidence": "low",
        "rationale_summary": "Candidate lacks enough evidence to classify as a monitorable supply or a definite rejection.",
        "evidence_refs": evidence_refs,
    }


def _summary_from_counter(counter: Counter[str]) -> dict[str, int]:
    return {key: int(value) for key, value in sorted(counter.items())}


def _get_owned_batch(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, project_id, created_by_profile_id, status
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
        return row


def create_agentic_shadow_run(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    batch = _get_owned_batch(
        conn,
        created_by_profile_id=created_by_profile_id,
        input_batch_id=input_batch_id,
    )
    candidates = payload.get("candidates") or []

    with conn.cursor() as cur:
        cur.execute(
            """
            select id
            from project_input_documents
            where input_batch_id = %s
            """,
            (input_batch_id,),
        )
        document_ids = {str(row["id"]) for row in cur.fetchall()}

        cur.execute(
            """
            select id
            from project_input_extracted_rows
            where input_batch_id = %s
            """,
            (input_batch_id,),
        )
        extracted_row_ids = {str(row["id"]) for row in cur.fetchall()}

        cur.execute(
            """
            select id
            from project_input_normalized_supplies
            where input_batch_id = %s
            """,
            (input_batch_id,),
        )
        normalized_supply_ids = {str(row["id"]) for row in cur.fetchall()}

        cur.execute(
            """
            insert into project_input_agentic_runs (
              input_batch_id,
              project_id,
              created_by_profile_id,
              pipeline_variant,
              status,
              model_name,
              retrieval_strategy,
              prompt_version,
              summary
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            returning id
            """,
            (
                input_batch_id,
                batch.get("project_id"),
                created_by_profile_id,
                str(payload.get("pipeline_variant") or "agentic_shadow"),
                str(payload.get("status") or "running"),
                payload.get("model_name"),
                payload.get("retrieval_strategy"),
                payload.get("prompt_version"),
                _json(payload.get("summary") or {}, {}),
            ),
        )
        row = cur.fetchone()
        if not row or not row.get("id"):
            raise RuntimeError("Could not create agentic shadow run.")
        agentic_run_id = str(row["id"])

        origin_counter: Counter[str] = Counter()
        for candidate in candidates:
            candidate_id = str(candidate.get("shadow_candidate_id") or "").strip()
            if not candidate_id:
                raise ValueError("Every shadow candidate must include shadow_candidate_id.")
            try:
                uuid.UUID(candidate_id)
            except Exception as exc:
                raise ValueError("shadow_candidate_id must be a valid UUID.") from exc

            document_id = str(candidate.get("document_id") or "").strip()
            if document_id not in document_ids:
                raise ValueError("Shadow candidate references unknown document_id for input batch.")

            candidate_input_batch_id = str(candidate.get("input_batch_id") or "").strip()
            if candidate_input_batch_id != input_batch_id:
                raise ValueError("Shadow candidate input_batch_id must match the route input_batch_id.")

            deterministic_extracted_row_id = (
                str(candidate.get("deterministic_extracted_row_id") or "").strip() or None
            )
            if deterministic_extracted_row_id and deterministic_extracted_row_id not in extracted_row_ids:
                raise ValueError(
                    "Shadow candidate references unknown deterministic_extracted_row_id."
                )

            deterministic_normalized_supply_id = (
                str(candidate.get("deterministic_normalized_supply_id") or "").strip() or None
            )
            if (
                deterministic_normalized_supply_id
                and deterministic_normalized_supply_id not in normalized_supply_ids
            ):
                raise ValueError(
                    "Shadow candidate references unknown deterministic_normalized_supply_id."
                )

            candidate_origin = str(candidate.get("candidate_origin") or "").strip()
            if (
                candidate_origin != "agentic_only_candidate"
                and not deterministic_extracted_row_id
            ):
                raise ValueError(
                    "Non-agentic_only candidates must include deterministic_extracted_row_id."
                )
            if (
                candidate_origin == "agentic_only_candidate"
                and deterministic_extracted_row_id is not None
            ):
                raise ValueError(
                    "agentic_only_candidate cannot include deterministic_extracted_row_id."
                )

            cur.execute(
                """
                insert into project_input_agentic_candidates (
                  id,
                  agentic_run_id,
                  input_batch_id,
                  project_id,
                  document_id,
                  candidate_origin,
                  deterministic_extracted_row_id,
                  deterministic_normalized_supply_id,
                  source_type,
                  source_ref,
                  raw_text,
                  raw_name,
                  raw_unit,
                  raw_category,
                  raw_quantity,
                  raw_unit_price,
                  raw_total_price,
                  context_before,
                  context_after,
                  section_labels,
                  evidence_refs,
                  raw_columns,
                  span_offsets,
                  table_signature,
                  extraction_confidence,
                  extraction_notes
                )
                values (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s,
                  %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s::jsonb
                )
                """,
                (
                    candidate_id,
                    agentic_run_id,
                    input_batch_id,
                    batch.get("project_id"),
                    document_id,
                    candidate_origin,
                    deterministic_extracted_row_id,
                    deterministic_normalized_supply_id,
                    candidate.get("source_type"),
                    _json(candidate.get("source_ref") or {}, {}),
                    candidate.get("raw_text"),
                    candidate.get("raw_name"),
                    candidate.get("raw_unit"),
                    candidate.get("raw_category"),
                    _to_decimal_or_none(candidate.get("raw_quantity")),
                    _to_decimal_or_none(candidate.get("raw_unit_price")),
                    _to_decimal_or_none(candidate.get("raw_total_price")),
                    _json(candidate.get("context_before") or [], []),
                    _json(candidate.get("context_after") or [], []),
                    _json(candidate.get("section_labels") or [], []),
                    _json(candidate.get("evidence_refs") or [], []),
                    _json(candidate.get("raw_columns") or {}, {}),
                    _json(candidate.get("span_offsets") or {}, {}),
                    candidate.get("table_signature"),
                    candidate.get("extraction_confidence"),
                    _json(candidate.get("extraction_notes") or [], []),
                ),
            )
            origin_counter[candidate_origin] += 1

        summary = {
            **(payload.get("summary") or {}),
            "candidate_count": len(candidates),
            "candidate_origin_counts": _summary_from_counter(origin_counter),
        }
        cur.execute(
            """
            update project_input_agentic_runs
            set summary = %s::jsonb, updated_at = now()
            where id = %s
            """,
            (_json(summary, {}), agentic_run_id),
        )

    return {
        "agentic_run_id": agentic_run_id,
        "input_batch_id": input_batch_id,
        "project_id": str(batch.get("project_id")) if batch.get("project_id") else None,
        "candidate_count": len(candidates),
        "candidate_origin_counts": _summary_from_counter(origin_counter),
    }


def qualify_agentic_shadow_run(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    agentic_run_id: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = payload or {}
    batch = _get_owned_batch(
        conn,
        created_by_profile_id=created_by_profile_id,
        input_batch_id=input_batch_id,
    )

    with conn.cursor() as cur:
        cur.execute(
            """
            select id, summary
            from project_input_agentic_runs
            where id = %s and input_batch_id = %s
            limit 1
            """,
            (agentic_run_id, input_batch_id),
        )
        run = cur.fetchone()
        if not run:
            raise ValueError("agentic_run_id no existe para ese input_batch_id.")

        cur.execute(
            """
            select
              c.id,
              c.document_id,
              c.deterministic_extracted_row_id,
              c.source_type,
              c.source_ref,
              c.raw_text,
              c.raw_name,
              c.raw_unit,
              c.raw_category,
              c.raw_quantity,
              c.raw_unit_price,
              c.raw_total_price,
              c.context_before,
              c.context_after,
              c.section_labels,
              c.evidence_refs,
              c.raw_columns,
              c.table_signature,
              c.extraction_confidence,
              c.candidate_origin
            from project_input_agentic_candidates c
            where c.agentic_run_id = %s
            order by c.created_at asc, c.id asc
            """,
            (agentic_run_id,),
        )
        candidates = cur.fetchall()

        label_counter: Counter[str] = Counter()
        qualified_supply_count = 0
        monitorable_supply_count = 0

        for candidate in candidates:
            judgment = _infer_judgment(candidate)
            label_counter[judgment["judgment_label"]] += 1
            if judgment["is_qualified"]:
                qualified_supply_count += 1
            if judgment["is_market_monitorable"] is True:
                monitorable_supply_count += 1

            retrieval_context = {
                "source_type": candidate.get("source_type"),
                "source_ref": candidate.get("source_ref") or {},
                "context_before": candidate.get("context_before") or [],
                "context_after": candidate.get("context_after") or [],
                "section_labels": candidate.get("section_labels") or [],
                "raw_columns": candidate.get("raw_columns") or {},
                "table_signature": candidate.get("table_signature"),
                "candidate_origin": candidate.get("candidate_origin"),
            }

            cur.execute(
                """
                insert into project_input_agentic_row_judgments (
                  agentic_run_id,
                  input_batch_id,
                  candidate_id,
                  extracted_row_id,
                  document_id,
                  judgment_label,
                  is_qualified,
                  is_market_monitorable,
                  confidence,
                  rationale_summary,
                  evidence,
                  retrieval_context
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                on conflict (agentic_run_id, candidate_id)
                do update set
                  extracted_row_id = excluded.extracted_row_id,
                  document_id = excluded.document_id,
                  judgment_label = excluded.judgment_label,
                  is_qualified = excluded.is_qualified,
                  is_market_monitorable = excluded.is_market_monitorable,
                  confidence = excluded.confidence,
                  rationale_summary = excluded.rationale_summary,
                  evidence = excluded.evidence,
                  retrieval_context = excluded.retrieval_context,
                  updated_at = now()
                """,
                (
                    agentic_run_id,
                    input_batch_id,
                    candidate["id"],
                    candidate.get("deterministic_extracted_row_id"),
                    candidate["document_id"],
                    judgment["judgment_label"],
                    judgment["is_qualified"],
                    judgment["is_market_monitorable"],
                    judgment["confidence"],
                    judgment["rationale_summary"],
                    _json(judgment["evidence_refs"], []),
                    _json(retrieval_context, {}),
                ),
            )

        summary = {
            **(run.get("summary") or {}),
            **(payload.get("summary") or {}),
            "candidate_count": len(candidates),
            "qualified_supply_count": qualified_supply_count,
            "rejected_candidate_count": max(len(candidates) - qualified_supply_count, 0),
            "monitorable_supply_count": monitorable_supply_count,
            "judgment_counts": _summary_from_counter(label_counter),
        }
        cur.execute(
            """
            update project_input_agentic_runs
            set
              status = %s,
              model_name = coalesce(%s, model_name),
              retrieval_strategy = coalesce(%s, retrieval_strategy),
              prompt_version = coalesce(%s, prompt_version),
              summary = %s::jsonb,
              updated_at = now()
            where id = %s
            """,
            (
                "completed",
                payload.get("model_name"),
                payload.get("retrieval_strategy"),
                payload.get("prompt_version"),
                _json(summary, {}),
                agentic_run_id,
            ),
        )

    return {
        "agentic_run_id": agentic_run_id,
        "input_batch_id": input_batch_id,
        "project_id": str(batch.get("project_id")) if batch.get("project_id") else None,
        "candidate_count": len(candidates),
        "qualified_supply_count": qualified_supply_count,
        "rejected_candidate_count": max(len(candidates) - qualified_supply_count, 0),
        "monitorable_supply_count": monitorable_supply_count,
        "judgment_counts": _summary_from_counter(label_counter),
    }


def get_project_supply_selection_comparison(
    conn: Connection,
    *,
    project_id: str,
) -> dict[str, Any]:
    deterministic = get_latest_project_input_batch(conn, project_id=project_id) or {
        "batch": None,
        "documents": [],
        "normalized_supplies": [],
        "row_counts": {
            "document_count": 0,
            "extracted_row_count": 0,
            "normalized_supply_count": 0,
            "row_normalization_count": 0,
        },
    }

    with conn.cursor() as cur:
        cur.execute(
            """
            select
              r.id,
              r.input_batch_id,
              r.project_id,
              r.pipeline_variant,
              r.status,
              r.model_name,
              r.retrieval_strategy,
              r.prompt_version,
              r.summary,
              r.created_at,
              r.updated_at
            from project_input_agentic_runs r
            where r.project_id = %s
            order by r.created_at desc
            limit 1
            """,
            (project_id,),
        )
        run = cur.fetchone()
        if not run:
            return {
                "input_batch_id": deterministic.get("batch", {}).get("id") if deterministic.get("batch") else None,
                "deterministic": deterministic,
                "agentic_shadow": None,
                "comparison": {},
                "provenance": {
                    "document_count": deterministic.get("row_counts", {}).get("document_count", 0),
                },
            }

        agentic_run_id = str(run["id"])

        cur.execute(
            """
            select
              c.id,
              c.document_id,
              c.candidate_origin,
              c.deterministic_extracted_row_id,
              c.source_type,
              c.raw_text,
              c.raw_name,
              c.raw_unit,
              c.raw_category,
              c.raw_quantity,
              c.raw_total_price,
              j.judgment_label,
              j.is_qualified,
              j.is_market_monitorable,
              j.confidence,
              j.rationale_summary
            from project_input_agentic_candidates c
            left join project_input_agentic_row_judgments j
              on j.agentic_run_id = c.agentic_run_id
             and j.candidate_id = c.id
            where c.agentic_run_id = %s
            order by c.created_at asc, c.id asc
            """,
            (agentic_run_id,),
        )
        candidates = cur.fetchall()

    deterministic_counts = deterministic.get("row_counts") or {}
    agentic_summary = run.get("summary") or {}

    comparison = {
        "coverage_delta": None,
        "qualified_supply_delta": int(agentic_summary.get("qualified_supply_count", 0))
        - int(deterministic_counts.get("normalized_supply_count", 0)),
        "provenance_completeness_delta": None,
    }

    return {
        "input_batch_id": str(run["input_batch_id"]),
        "deterministic": deterministic,
        "agentic_shadow": {
            "run": run,
            "summary": agentic_summary,
            "candidates": candidates,
        },
        "comparison": comparison,
        "provenance": {
            "document_count": deterministic_counts.get("document_count", 0),
            "candidate_count": int(agentic_summary.get("candidate_count", 0)),
        },
    }
