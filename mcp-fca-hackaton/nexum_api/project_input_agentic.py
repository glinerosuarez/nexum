from __future__ import annotations

import json
import os
import re
import unicodedata
import uuid
from collections import Counter
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field
from psycopg import Connection

from domain.observability.arize_tracing import (
    comparison_attributes,
    current_trace_id,
    force_flush,
    mark_span_error,
    mark_span_ok,
    set_span_attributes,
    start_as_current_span,
    tracing_enabled,
    tracing_status,
)

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

_SERIES_KEYWORDS: dict[str, set[str]] = {
    "steel": {"acero", "varilla", "rebar", "corrugado", "metalica", "metalico"},
    "cement": {"cemento", "concreto", "mortero", "fibrocemento"},
    "lumber": {"madera", "lamina", "tablero", "puerta"},
}

_CATEGORY_SERIES_HINTS: dict[str, list[tuple[str, set[str]]]] = {
    "steel": [
        (
            "electrical_or_metal_system",
            {
                "tableros",
                "instalaciones electricas",
                "instalaciones eléctricas",
                "iluminacion",
                "iluminación",
                "aire acondicionado",
                "sistema de aire acondicionado",
                "ventanas",
                "elementos arquitectonicos",
                "elementos arquitectónicos",
                "divisiones en vidrio templado",
            },
        ),
    ],
    "cement": [
        (
            "masonry_or_finish_system",
            {
                "mesones",
                "pisos",
                "enchapes",
                "mamposteria",
                "mampostería",
                "panetes",
                "morteros",
            },
        ),
    ],
    "lumber": [
        (
            "carpentry_or_openings_system",
            {
                "carpinteria",
                "carpintería",
                "puertas",
                "closets",
                "muebles",
            },
        ),
    ],
}

_NAME_SERIES_HINTS: dict[str, list[tuple[str, set[str]]]] = {
    "steel": [
        (
            "metal_fixture_keywords",
            {
                "aluminio",
                "inox",
                "acero inoxidable",
                "metalica",
                "metalico",
                "baranda",
                "barandas",
                "pasamanos",
                "rejilla",
                "rejillas",
                "toallero",
                "jabonera",
                "portarollo",
                "griferia",
                "grifería",
                "cableado",
                "cable",
                "cobre",
                "awg",
                "ducto",
                "fancoil",
            },
        ),
    ],
    "cement": [
        (
            "masonry_finish_keywords",
            {
                "alistado",
                "mortero",
                "concreto",
                "cemento",
                "fibrocemento",
                "piso",
                "pisos",
                "enchape",
                "enchapes",
                "boquilla",
                "pegante",
                "nivelacion",
                "nivelación",
            },
        ),
    ],
    "lumber": [
        (
            "opening_finish_keywords",
            {
                "puerta",
                "puertas",
                "ventana",
                "ventanas",
                "closet",
                "closets",
                "madera",
                "tablero",
                "lamina",
                "lamina rh",
                "melamina",
                "mdf",
            },
        ),
    ],
}

_PLUMBING_NETWORK_CATEGORIES = {
    "aparatos sanitarios",
    "red aguas residuales",
    "red sanitaria",
    "red suministro de agua potable",
    "red suministro de agua caliente",
}

_PLUMBING_NETWORK_KEYWORDS = {
    "cpvc",
    "hidraulica",
    "hidraulico",
    "punto hidraulico",
    "punto sanitario",
    "pvc-s",
    "red hidraulica",
    "red sanitaria",
    "sanitaria",
    "sanitario",
    "tapa registro",
}

_PLUMBING_STEEL_KEYWORDS = {
    "barra abatible",
    "barra de seguridad",
    "compuerta",
    "griferia",
    "grifería",
    "jabonera",
    "porta rollo",
    "portarollo",
    "rejilla",
    "rejillas",
    "sifon",
    "soporte",
    "soportes",
    "toallero",
    "valvula",
    "válvula",
}

_SUPPLY_CLASS_HINTS: list[tuple[str, set[str]]] = [
    ("valve", {"valvula", "válvula", "compuerta", "registro"}),
    ("siphon", {"sifon", "sifón"}),
    ("grate", {"rejilla", "rejillas"}),
    ("grab_bar", {"barra de seguridad", "barra abatible"}),
    ("paper_holder", {"portarollo", "porta rollo"}),
    ("soap_dish", {"jabonera", "jaboneras"}),
    ("towel_bar", {"toallero", "toalleros"}),
    ("support", {"soporte", "soportes"}),
    ("faucet", {"griferia", "grifería"}),
    ("sanitary_point", {"punto sanitario"}),
    ("hydraulic_point", {"punto hidraulico", "punto hidráulico"}),
    ("pipe_network", {"red hidraulica", "red hidráulica", "red sanitaria", "red suministro", "pvc-s", "cpvc"}),
    ("wall_finish", {"panete", "panetes", "enchape", "enchapes", "alistado"}),
    ("tile_finish", {"piso", "pisos", "tablon", "tablón"}),
    ("window", {"ventana", "ventanas"}),
    ("door", {"puerta", "puertas"}),
    ("handrail", {"pasamanos", "baranda", "barandas"}),
    ("countertop", {"meson", "mesón", "mesones"}),
    ("data_labeling", {"utp", "marquillado", "red de datos"}),
]

_CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}
_CONFIDENCE_BY_RANK = {value: key for key, value in _CONFIDENCE_RANK.items()}
_SHADOW_SPAN_SAMPLE_LIMIT = 8


class _ShadowExtractionSelection(BaseModel):
    row_key: str
    extraction_confidence: str = "medium"
    extraction_note: str = ""


class _ShadowExtractionResult(BaseModel):
    selected_rows: list[_ShadowExtractionSelection] = Field(default_factory=list)


def _json(value: Any, default: Any) -> str:
    payload = default if value is None else value
    return json.dumps(payload, default=str)


def _truncate_text(value: Any, *, max_chars: int = 220) -> str:
    text = _collapse_whitespace(value)
    if len(text) <= max_chars:
        return text
    return f"{text[: max_chars - 3]}..."


def _compact_source_ref(source_ref: Any) -> dict[str, Any]:
    payload = dict(source_ref or {})
    return {
        "sheet_name": payload.get("sheet_name"),
        "row_index": payload.get("row_index"),
        "chunk_id": payload.get("chunk_id"),
    }


def _compact_evidence_refs(evidence_refs: Any, *, max_items: int = 3) -> list[dict[str, Any]]:
    compact: list[dict[str, Any]] = []
    for item in list(evidence_refs or [])[:max_items]:
        if not isinstance(item, dict):
            continue
        compact.append(
            {
                "type": item.get("type"),
                "value": _truncate_text(item.get("value"), max_chars=140),
            }
        )
    return compact


def _sample_candidate_records(
    candidates: list[dict[str, Any]],
    *,
    limit: int = _SHADOW_SPAN_SAMPLE_LIMIT,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for candidate in candidates[:limit]:
        records.append(
            {
                "candidate_id": str(candidate.get("id") or candidate.get("shadow_candidate_id") or ""),
                "candidate_origin": candidate.get("candidate_origin"),
                "document_id": candidate.get("document_id"),
                "source_type": candidate.get("source_type"),
                "source_ref": _compact_source_ref(candidate.get("source_ref")),
                "raw_name": _truncate_text(candidate.get("raw_name") or candidate.get("raw_text")),
                "raw_unit": candidate.get("raw_unit"),
                "raw_quantity": candidate.get("raw_quantity"),
                "raw_total_price": candidate.get("raw_total_price"),
                "section_labels": list(candidate.get("section_labels") or [])[:2],
                "extraction_confidence": candidate.get("extraction_confidence"),
                "extraction_notes": [_truncate_text(item, max_chars=140) for item in list(candidate.get("extraction_notes") or [])[:2]],
                "deterministic_extracted_row_id": candidate.get("deterministic_extracted_row_id"),
                "deterministic_normalized_supply_id": candidate.get("deterministic_normalized_supply_id"),
            }
        )
    return records


def _sample_judgment_records(
    candidates_with_judgments: list[tuple[dict[str, Any], dict[str, Any]]],
    *,
    predicate,
    limit: int = _SHADOW_SPAN_SAMPLE_LIMIT,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for candidate, judgment in candidates_with_judgments:
        if not predicate(candidate, judgment):
            continue
        records.append(
            {
                "candidate_id": str(candidate.get("id") or ""),
                "candidate_origin": candidate.get("candidate_origin"),
                "raw_name": _truncate_text(candidate.get("raw_name") or candidate.get("raw_text")),
                "source_ref": _compact_source_ref(candidate.get("source_ref")),
                "judgment_label": judgment.get("judgment_label"),
                "is_qualified": judgment.get("is_qualified"),
                "is_market_monitorable": judgment.get("is_market_monitorable"),
                "confidence": judgment.get("confidence"),
                "rationale_summary": _truncate_text(judgment.get("rationale_summary")),
                "evidence_refs": _compact_evidence_refs(judgment.get("evidence_refs")),
            }
        )
        if len(records) >= limit:
            break
    return records


def _sample_mapping_records(
    supplies: list[dict[str, Any]],
    mappings: list[dict[str, Any]],
    *,
    mapped_only: bool | None,
    limit: int = _SHADOW_SPAN_SAMPLE_LIMIT,
) -> list[dict[str, Any]]:
    mapping_by_supply_id = {str(mapping.get("agentic_supply_id")): mapping for mapping in mappings}
    records: list[dict[str, Any]] = []
    for supply in supplies:
        supply_id = str(supply.get("id") or "")
        mapping = mapping_by_supply_id.get(supply_id) or {}
        if mapped_only is True and mapping.get("mapping_status") != "mapped":
            continue
        if mapped_only is False and mapping.get("mapping_status") == "mapped":
            continue
        records.append(
            {
                "agentic_supply_id": supply_id,
                "display_name": _truncate_text(supply.get("display_name") or supply.get("canonical_name")),
                "canonical_name": _truncate_text(supply.get("canonical_name")),
                "canonical_unit": supply.get("canonical_unit"),
                "canonical_category": _truncate_text(supply.get("canonical_category"), max_chars=120),
                "deterministic_normalized_supply_id": supply.get("deterministic_normalized_supply_id"),
                "mapping_status": mapping.get("mapping_status"),
                "monitorability_status": supply.get("monitorability_status"),
                "supply_class": mapping.get("supply_class"),
                "supply_class_confidence": mapping.get("supply_class_confidence"),
                "series_key": mapping.get("series_key"),
                "mapping_strategy": mapping.get("mapping_strategy"),
                "confidence": mapping.get("confidence"),
                "rationale_summary": _truncate_text(mapping.get("rationale_summary")),
            }
        )
        if len(records) >= limit:
            break
    return records


def _attach_span_json_samples(
    span: Any,
    samples: dict[str, list[dict[str, Any]]],
) -> None:
    attrs: dict[str, Any] = {}
    for sample_name, sample_records in samples.items():
        attrs[f"shadow.sample.{sample_name}.count"] = len(sample_records)
        attrs[f"shadow.sample.{sample_name}_json"] = _json(sample_records, [])
    set_span_attributes(span, attrs)


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


def _observability_payload(trace_id: str | None) -> dict[str, Any]:
    return {
        "phoenix_tracing_enabled": tracing_enabled(),
        "phoenix_status": tracing_status(),
        "trace_id": trace_id,
    }


def _summary_with_observability(summary: dict[str, Any] | None, trace_id: str | None) -> dict[str, Any]:
    payload = dict(summary or {})
    payload["observability"] = _observability_payload(trace_id)
    return payload


def _agentic_shadow_comparison_attrs(
    *,
    payload: dict[str, Any],
    input_batch_id: str,
    project_id: str | None = None,
) -> dict[str, Any]:
    payload_project_id = str(payload.get("project_id") or "").strip() or None
    return comparison_attributes(
        pipeline_variant=str(payload.get("pipeline_variant") or "agentic_shadow"),
        project_id=project_id or payload_project_id,
        input_batch_id=input_batch_id,
        benchmark_dataset=str(payload.get("benchmark_dataset") or "").strip() or None,
        benchmark_instance_id=(
            str(payload.get("benchmark_instance_id") or "").strip()
            or project_id
            or payload_project_id
            or input_batch_id
        ),
        pipeline_version=str(payload.get("pipeline_version") or "").strip() or None,
    )


def _vertex_project_id() -> str | None:
    value = (os.getenv("VERTEX_PROJECT_ID") or "").strip()
    return value or None


def _vertex_location() -> str:
    return (os.getenv("VERTEX_LOCATION") or "us-central1").strip()


def _vertex_model() -> str:
    return (os.getenv("VERTEX_MODEL") or "gemini-2.5-flash").strip()


def _coerce_confidence(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"high", "medium", "low"}:
        return text
    return "medium"


def _build_shadow_extraction_prompt(chunk: dict[str, Any]) -> str:
    compact_rows = []
    for row in chunk.get("rows") or []:
        compact_rows.append(
            {
                "row_key": row.get("row_key"),
                "row_index": row.get("row_index"),
                "raw_name": row.get("raw_name"),
                "raw_unit": row.get("raw_unit"),
                "raw_category": row.get("raw_category"),
                "raw_quantity": row.get("raw_quantity"),
                "raw_unit_price": row.get("raw_unit_price"),
                "raw_total_price": row.get("raw_total_price"),
                "section_labels": row.get("section_labels") or [],
            }
        )
    prompt_payload = {
        "source_type": chunk.get("source_type"),
        "source_ref": chunk.get("source_ref") or {},
        "headers": chunk.get("headers") or [],
        "context_before": chunk.get("context_before") or [],
        "context_after": chunk.get("context_after") or [],
        "section_labels": chunk.get("section_labels") or [],
        "rows": compact_rows,
    }
    return (
        "You are extracting construction supply-intelligence candidates from a raw document chunk.\n"
        "Select rows that should be persisted for later qualification. Include likely direct supplies, "
        "bundle or supply-install rows, headings/chapters that organize relevant material sections, and "
        "scope/activity rows that appear supply-adjacent. Exclude blank rows, taxes, totals, subtotals, "
        "administration, utility, and IVA lines.\n"
        "Return only row_key values that should become candidates.\n\n"
        f"Chunk payload:\n{json.dumps(prompt_payload, ensure_ascii=False)}"
    )


def _invoke_vertex_shadow_extractor(
    chunk: dict[str, Any],
    *,
    model_name: str | None,
) -> _ShadowExtractionResult:
    from langchain_google_vertexai import ChatVertexAI

    llm = ChatVertexAI(
        model=model_name or _vertex_model(),
        project=_vertex_project_id(),
        location=_vertex_location(),
        temperature=0,
        max_retries=3,
    )
    structured = llm.with_structured_output(
        _ShadowExtractionResult,
        method="json_schema",
    )
    return structured.invoke(_build_shadow_extraction_prompt(chunk))


def _collapse_whitespace(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def _normalize_unit(value: Any) -> str | None:
    unit = _collapse_whitespace(value).lower()
    return unit or None


def _confidence_min(a: str, b: str) -> str:
    return _CONFIDENCE_BY_RANK[min(_CONFIDENCE_RANK.get(a, 0), _CONFIDENCE_RANK.get(b, 0))]


def _canonical_category(candidate: dict[str, Any]) -> str:
    raw_category = _collapse_whitespace(candidate.get("raw_category"))
    if raw_category:
        return _normalize_text(raw_category)
    section_labels = [str(item).strip() for item in (candidate.get("section_labels") or []) if str(item).strip()]
    if section_labels:
        return _normalize_text(section_labels[0])
    return "material"


def _deterministic_group_key(candidate: dict[str, Any]) -> str:
    deterministic_normalized_supply_id = (
        str(candidate.get("deterministic_normalized_supply_id") or "").strip() or None
    )
    if deterministic_normalized_supply_id:
        return f"det:{deterministic_normalized_supply_id}"
    canonical_name = _normalize_text(candidate.get("raw_name") or candidate.get("raw_text") or "")
    canonical_unit = _normalize_unit(candidate.get("raw_unit")) or "sin_unidad"
    canonical_category = _canonical_category(candidate)
    return f"{canonical_name}|{canonical_unit}|{canonical_category}"


def _infer_series_key(value: Any) -> str | None:
    normalized = _normalize_text(value)
    words = set(_word_tokens(normalized))
    for series_key, keywords in _SERIES_KEYWORDS.items():
        if words & keywords:
            return series_key
    return None


def _find_series_hint(values: list[str]) -> tuple[str | None, str | None]:
    normalized_values = [_normalize_text(value) for value in values if str(value or "").strip()]
    joined = " ".join(normalized_values)
    tokens = set(_word_tokens(joined))

    for series_key, hints in _NAME_SERIES_HINTS.items():
        for hint_name, keywords in hints:
            if any(_matches_hint(keyword, joined=joined, tokens=tokens) for keyword in keywords):
                return series_key, hint_name

    for series_key, hints in _CATEGORY_SERIES_HINTS.items():
        for hint_name, keywords in hints:
            if any(_matches_hint(keyword, joined=joined, tokens=tokens) for keyword in keywords):
                return series_key, hint_name

    return None, None


def _matches_hint(keyword: str, *, joined: str, tokens: set[str]) -> bool:
    normalized_keyword = _normalize_text(keyword)
    if not normalized_keyword:
        return False
    keyword_tokens = _word_tokens(normalized_keyword)
    if not keyword_tokens:
        return False
    if len(keyword_tokens) == 1:
        return keyword_tokens[0] in tokens
    pattern = rf"\b{re.escape(normalized_keyword)}\b"
    return re.search(pattern, joined) is not None


def _infer_supply_class(supply: dict[str, Any]) -> tuple[str | None, str]:
    values = [
        str(supply.get("canonical_name") or ""),
        str(supply.get("display_name") or ""),
        str(supply.get("canonical_category") or ""),
    ]
    normalized_values = [_normalize_text(value) for value in values if str(value or "").strip()]
    joined = " ".join(normalized_values)
    tokens = set(_word_tokens(joined))
    for supply_class, keywords in _SUPPLY_CLASS_HINTS:
        if any(_matches_hint(keyword, joined=joined, tokens=tokens) for keyword in keywords):
            confidence = (
                "high"
                if supply_class
                in {
                    "valve",
                    "siphon",
                    "grate",
                    "grab_bar",
                    "paper_holder",
                    "soap_dish",
                    "towel_bar",
                    "sanitary_point",
                    "hydraulic_point",
                }
                else "medium"
            )
            return supply_class, confidence
    return None, "low"


def _plumbing_source_mapping(supply: dict[str, Any]) -> dict[str, Any] | None:
    values = [
        str(supply.get("canonical_name") or ""),
        str(supply.get("display_name") or ""),
        str(supply.get("canonical_category") or ""),
    ]
    normalized_values = [_normalize_text(value) for value in values if str(value or "").strip()]
    joined = " ".join(normalized_values)
    tokens = set(_word_tokens(joined))
    category = _normalize_text(supply.get("canonical_category") or "")

    plumbing_context = category in _PLUMBING_NETWORK_CATEGORIES or any(
        _matches_hint(keyword, joined=joined, tokens=tokens) for keyword in _PLUMBING_NETWORK_KEYWORDS
    )
    if not plumbing_context:
        return None

    if any(_matches_hint(keyword, joined=joined, tokens=tokens) for keyword in _PLUMBING_STEEL_KEYWORDS):
        supply_class, supply_class_confidence = _infer_supply_class(supply)
        return {
            "mapping_status": "mapped",
            "monitorability_status": "monitorable",
            "mapping_strategy": "keyword_fallback",
            "supply_class": supply_class,
            "supply_class_confidence": supply_class_confidence,
            "series_key": "steel",
            "series_id": None,
            "source_name": "shadow_keyword_mapping",
            "source_url": None,
            "confidence": "medium",
            "rationale_summary": (
                "Shadow supply matched market family `steel` via plumbing fixture fallback `plumbing_metal_fixture_keywords`."
            ),
            "mapping_hint": "plumbing_metal_fixture_keywords",
        }

    return {
        "mapping_status": "unmapped",
        "monitorability_status": "unresolved",
        "mapping_strategy": "unmapped",
        "supply_class": _infer_supply_class(supply)[0],
        "supply_class_confidence": _infer_supply_class(supply)[1],
        "series_key": None,
        "series_id": None,
        "source_name": None,
        "source_url": None,
        "confidence": "low",
        "rationale_summary": (
            "Shadow supply remains unmapped after configured-source lookup and plumbing-aware fallback."
        ),
        "mapping_hint": "plumbing_network_unmapped",
    }


def _configured_source_mapping(source_row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not source_row:
        return None
    parse_config = source_row.get("parse_config") if isinstance(source_row.get("parse_config"), dict) else {}
    series_key = str(parse_config.get("series_key") or "").strip() or None
    if not series_key:
        return None
    supply_class, supply_class_confidence = _infer_supply_class({"canonical_name": source_row.get("source_name")})
    return {
        "mapping_status": "mapped",
        "monitorability_status": "monitorable",
        "mapping_strategy": "retrieval_catalog_match",
        "supply_class": supply_class,
        "supply_class_confidence": supply_class_confidence,
        "series_key": series_key,
        "series_id": str(parse_config.get("series_id") or "").strip() or None,
        "source_name": source_row.get("source_name"),
        "source_url": source_row.get("source_url"),
        "confidence": "high",
        "rationale_summary": (
            f"Shadow supply inherited configured source mapping for deterministic supply `{source_row.get('supply_id')}`."
        ),
        "mapping_hint": "deterministic_configured_source",
    }


def _heuristic_source_mapping(supply: dict[str, Any]) -> dict[str, Any]:
    name_parts = [
        str(supply.get("canonical_name") or ""),
        str(supply.get("display_name") or ""),
        str(supply.get("canonical_category") or ""),
    ]
    supply_class, supply_class_confidence = _infer_supply_class(supply)
    plumbing_mapping = _plumbing_source_mapping(supply)
    if plumbing_mapping:
        return plumbing_mapping

    series_key = _infer_series_key(" ".join(name_parts))
    mapping_hint: str | None = "keyword_fallback" if series_key else None
    if not series_key:
        series_key, mapping_hint = _find_series_hint(name_parts)

    has_material_signal = _has_material_signal(str(supply.get("canonical_name") or ""))
    if series_key:
        strategy = "keyword_fallback"
        used_category_hint = bool(mapping_hint and mapping_hint != "keyword_fallback")
        confidence = "medium"
        rationale = (
            f"Shadow supply matched market family `{series_key}` via category-aware fallback `{mapping_hint}`."
            if used_category_hint
            else f"Shadow supply matched market family `{series_key}` by keyword fallback."
        )
        return {
            "mapping_status": "mapped",
            "monitorability_status": "monitorable",
            "mapping_strategy": strategy,
            "supply_class": supply_class,
            "supply_class_confidence": supply_class_confidence,
            "series_key": series_key,
            "series_id": None,
            "source_name": "shadow_keyword_mapping",
            "source_url": None,
            "confidence": confidence,
            "rationale_summary": rationale,
            "mapping_hint": mapping_hint,
        }

    return {
        "mapping_status": "unmapped",
        "monitorability_status": "monitorable" if has_material_signal else "unresolved",
        "mapping_strategy": "unmapped",
        "supply_class": supply_class,
        "supply_class_confidence": supply_class_confidence,
        "series_key": None,
        "series_id": None,
        "source_name": None,
        "source_url": None,
        "confidence": "low",
        "rationale_summary": "Shadow supply remains unmapped after configured-source lookup and category-aware fallback.",
        "mapping_hint": None,
    }


def _load_supply_price_sources_by_supply_id(
    conn: Connection,
    supply_ids: list[str],
) -> dict[str, dict[str, Any]]:
    if not supply_ids:
        return {}

    with conn.cursor() as cur:
        cur.execute(
            """
            select supply_id, source_name, source_url, parse_config
            from supply_price_sources
            where supply_id = any(%s)
              and is_active = true
            order by priority asc, created_at asc
            """,
            (supply_ids,),
        )
        rows = cur.fetchall()

    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        supply_id = str(row.get("supply_id") or "").strip()
        if supply_id and supply_id not in grouped:
            grouped[supply_id] = row
    return grouped


def _build_shadow_supply_artifacts(
    candidates_with_judgments: list[tuple[dict[str, Any], dict[str, Any]]],
    *,
    agentic_run_id: str,
    input_batch_id: str,
    project_id: str | None,
    configured_sources_by_supply_id: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}

    for candidate, judgment in candidates_with_judgments:
        if not judgment.get("is_qualified"):
            continue

        group_key = _deterministic_group_key(candidate)
        canonical_name = _normalize_text(candidate.get("raw_name") or candidate.get("raw_text") or "")
        canonical_unit = _normalize_unit(candidate.get("raw_unit"))
        canonical_category = _canonical_category(candidate)
        display_name = _collapse_whitespace(candidate.get("raw_name") or candidate.get("raw_text") or canonical_name)
        deterministic_normalized_supply_id = (
            str(candidate.get("deterministic_normalized_supply_id") or "").strip() or None
        )
        supply = grouped.get(group_key)
        if not supply:
            supply = {
                "id": str(uuid.uuid4()),
                "agentic_run_id": agentic_run_id,
                "input_batch_id": input_batch_id,
                "project_id": project_id,
                "pipeline_variant": "agentic_shadow",
                "display_name": display_name,
                "canonical_name": canonical_name,
                "canonical_unit": canonical_unit,
                "canonical_category": canonical_category,
                "quantity_total": Decimal("0"),
                "unit_price_reference": None,
                "total_price_reference": Decimal("0"),
                "source_document_ids": set(),
                "source_extracted_row_ids": set(),
                "candidate_ids": [],
                "deterministic_normalized_supply_id": deterministic_normalized_supply_id,
                "confidence": judgment.get("confidence") or "low",
                "rationale_summary": judgment.get("rationale_summary"),
                "retrieval_evidence": [],
                "link_reasons": {},
            }
            grouped[group_key] = supply

        supply["quantity_total"] += _to_decimal_or_none(candidate.get("raw_quantity")) or Decimal("0")
        supply["total_price_reference"] += _to_decimal_or_none(candidate.get("raw_total_price")) or Decimal("0")
        if supply["unit_price_reference"] is None:
            supply["unit_price_reference"] = _to_decimal_or_none(candidate.get("raw_unit_price"))
        supply["source_document_ids"].add(str(candidate.get("document_id")))
        if candidate.get("deterministic_extracted_row_id"):
            supply["source_extracted_row_ids"].add(str(candidate.get("deterministic_extracted_row_id")))
        supply["candidate_ids"].append(str(candidate.get("id")))
        supply["confidence"] = _confidence_min(str(supply["confidence"]), str(judgment.get("confidence") or "low"))
        supply["retrieval_evidence"].extend(list(judgment.get("evidence_refs") or [])[:2])
        supply["link_reasons"][str(candidate.get("id"))] = (
            "matched deterministic normalized supply"
            if deterministic_normalized_supply_id
            else "grouped by canonical shadow supply key"
        )

    supplies: list[dict[str, Any]] = []
    row_links: list[dict[str, Any]] = []
    mappings: list[dict[str, Any]] = []
    mapping_status_counter: Counter[str] = Counter()
    monitorability_counter: Counter[str] = Counter()
    supply_class_counter: Counter[str] = Counter()

    for supply in grouped.values():
        deterministic_supply_id = str(supply.get("deterministic_normalized_supply_id") or "").strip()
        configured_mapping = _configured_source_mapping(
            (configured_sources_by_supply_id or {}).get(deterministic_supply_id)
        )
        mapping_decision = configured_mapping or _heuristic_source_mapping(supply)

        supply_payload = {
            **{k: v for k, v in supply.items() if k not in {"candidate_ids", "link_reasons"}},
            "monitorability_status": mapping_decision["monitorability_status"],
            "market_mapping_status": mapping_decision["mapping_status"],
            "source_document_ids": sorted(supply["source_document_ids"]),
            "source_extracted_row_ids": sorted(supply["source_extracted_row_ids"]),
            "retrieval_evidence": supply["retrieval_evidence"][:6],
            "mapping_candidate": {
                "supply_class": mapping_decision.get("supply_class"),
                "supply_class_confidence": mapping_decision.get("supply_class_confidence"),
                "series_key": mapping_decision["series_key"],
                "mapping_strategy": mapping_decision["mapping_strategy"],
                "mapping_hint": mapping_decision.get("mapping_hint"),
            },
        }
        supplies.append(supply_payload)
        mapping_status_counter[mapping_decision["mapping_status"]] += 1
        monitorability_counter[mapping_decision["monitorability_status"]] += 1
        if mapping_decision.get("supply_class"):
            supply_class_counter[str(mapping_decision["supply_class"])] += 1

        mappings.append(
            {
                "id": str(uuid.uuid4()),
                "agentic_run_id": agentic_run_id,
                "input_batch_id": input_batch_id,
                "project_id": project_id,
                "agentic_supply_id": supply["id"],
                "mapping_status": mapping_decision["mapping_status"],
                "mapping_strategy": mapping_decision["mapping_strategy"],
                "supply_class": mapping_decision.get("supply_class"),
                "supply_class_confidence": mapping_decision.get("supply_class_confidence"),
                "series_key": mapping_decision["series_key"],
                "series_id": mapping_decision["series_id"],
                "source_name": mapping_decision["source_name"],
                "source_url": mapping_decision["source_url"],
                "confidence": mapping_decision["confidence"],
                "rationale_summary": mapping_decision["rationale_summary"],
            }
        )

        for candidate_id in supply["candidate_ids"]:
            row_links.append(
                {
                    "id": str(uuid.uuid4()),
                    "agentic_run_id": agentic_run_id,
                    "candidate_id": candidate_id,
                    "extracted_row_id": next(
                        (
                            str(item[0].get("deterministic_extracted_row_id"))
                            for item in candidates_with_judgments
                            if str(item[0].get("id")) == candidate_id
                            and item[0].get("deterministic_extracted_row_id")
                        ),
                        None,
                    ),
                    "agentic_supply_id": supply["id"],
                    "link_reason": supply["link_reasons"].get(candidate_id) or "grouped by shadow supply key",
                }
            )

    return {
        "supplies": supplies,
        "row_links": row_links,
        "mappings": mappings,
        "summary": {
            "shadow_supply_count": len(supplies),
            "mapped_shadow_supply_count": int(mapping_status_counter.get("mapped", 0)),
            "unmapped_shadow_supply_count": int(mapping_status_counter.get("unmapped", 0)),
            "rejected_shadow_supply_count": int(mapping_status_counter.get("rejected", 0)),
            "monitorable_shadow_supply_count": int(monitorability_counter.get("monitorable", 0)),
            "unresolved_shadow_supply_count": int(monitorability_counter.get("unresolved", 0)),
            "supply_class_counts": dict(supply_class_counter),
        },
    }


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


def _load_deterministic_row_matches(
    conn: Connection,
    *,
    input_batch_id: str,
) -> tuple[dict[str, str], dict[str, dict[str, str | None]]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select
              r.id,
              r.document_id,
              r.raw_name,
              r.source_ref->>'sheet_name' as sheet_name,
              r.source_ref->>'row_index' as row_index,
              rn.normalized_supply_id
            from project_input_extracted_rows r
            left join project_input_row_normalizations rn
              on rn.extracted_row_id = r.id
            where r.input_batch_id = %s
            """,
            (input_batch_id,),
        )
        matches: dict[str, dict[str, str | None]] = {}
        document_ids: dict[str, str] = {}
        for row in cur.fetchall():
            document_ids[str(row["document_id"])] = str(row["document_id"])
            signature = "|".join(
                [
                    str(row.get("document_id") or ""),
                    str(row.get("sheet_name") or ""),
                    str(row.get("row_index") or ""),
                    _normalize_text(row.get("raw_name") or ""),
                ]
            )
            matches[signature] = {
                "extracted_row_id": str(row["id"]),
                "normalized_supply_id": str(row["normalized_supply_id"])
                if row.get("normalized_supply_id")
                else None,
            }
    return document_ids, matches


def _extract_agentic_shadow_run_impl(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    payload: dict[str, Any],
    trace_id: str | None,
) -> dict[str, Any]:
    batch = _get_owned_batch(
        conn,
        created_by_profile_id=created_by_profile_id,
        input_batch_id=input_batch_id,
    )
    chunks = payload.get("chunks") or []
    if not isinstance(chunks, list) or len(chunks) == 0:
        raise ValueError("At least one extraction chunk is required.")

    document_ids, deterministic_matches = _load_deterministic_row_matches(
        conn,
        input_batch_id=input_batch_id,
    )

    with start_as_current_span(
        "load_documents",
        kind="CHAIN",
        attributes={
            **_agentic_shadow_comparison_attrs(
                payload=payload,
                input_batch_id=input_batch_id,
                project_id=str(batch.get("project_id") or "") or None,
            ),
            "shadow.input_batch_id": input_batch_id,
            "shadow.chunk_count": len(chunks),
            "shadow.document_count": len({str(chunk.get("document_id") or "").strip() for chunk in chunks}),
            "shadow.deterministic_row_match_count": len(deterministic_matches),
        },
    ) as load_documents_span:
        mark_span_ok(load_documents_span)

    extracted_candidates: list[dict[str, Any]] = []
    chunk_selection_counts: list[int] = []
    candidate_origin_counter: Counter[str] = Counter()

    with start_as_current_span(
        "extract_shadow_candidates",
        kind="CHAIN",
        attributes={
            **_agentic_shadow_comparison_attrs(
                payload=payload,
                input_batch_id=input_batch_id,
                project_id=str(batch.get("project_id") or "") or None,
            ),
            "shadow.chunk_count": len(chunks),
            "shadow.model_name": str(payload.get("model_name") or _vertex_model()),
            "shadow.prompt_version": str(payload.get("prompt_version") or ""),
        },
    ) as extract_span:
        for chunk in chunks:
            document_id = str(chunk.get("document_id") or "").strip()
            if document_id not in document_ids:
                raise ValueError("Extraction chunk references unknown document_id for input batch.")

            rows = chunk.get("rows") or []
            row_by_key = {
                str(row.get("row_key") or "").strip(): row
                for row in rows
                if str(row.get("row_key") or "").strip()
            }
            if not row_by_key:
                chunk_selection_counts.append(0)
                continue

            result = _invoke_vertex_shadow_extractor(
                chunk,
                model_name=str(payload.get("model_name") or "").strip() or None,
            )
            chunk_selection_count = 0

            for selection in result.selected_rows:
                row = row_by_key.get(selection.row_key)
                if not row:
                    continue

                chunk_selection_count += 1
                source_ref = dict(chunk.get("source_ref") or {})
                source_ref["row_index"] = row.get("row_index")
                source_ref["sheet_name"] = source_ref.get("sheet_name")

                signature = "|".join(
                    [
                        document_id,
                        str(source_ref.get("sheet_name") or ""),
                        str(row.get("row_index") or ""),
                        _normalize_text(row.get("raw_name") or row.get("raw_text") or ""),
                    ]
                )
                deterministic_match = deterministic_matches.get(signature)
                candidate_origin = (
                    "matched_deterministic_candidate" if deterministic_match else "agentic_only_candidate"
                )
                evidence_refs = list(
                    [
                        {"type": "row_text", "value": row.get("raw_text")},
                        *(
                            [{"type": "sheet_name", "value": source_ref.get("sheet_name")}]
                            if source_ref.get("sheet_name")
                            else []
                        ),
                    ]
                )
                for label in list(row.get("section_labels") or [])[:2]:
                    evidence_refs.append({"type": "section_label", "value": label})

                extracted_candidates.append(
                    {
                        "shadow_candidate_id": str(uuid.uuid4()),
                        "input_batch_id": input_batch_id,
                        "document_id": document_id,
                        "candidate_origin": candidate_origin,
                        "deterministic_extracted_row_id": (
                            deterministic_match.get("extracted_row_id") if deterministic_match else None
                        ),
                        "deterministic_normalized_supply_id": (
                            deterministic_match.get("normalized_supply_id") if deterministic_match else None
                        ),
                        "source_type": chunk.get("source_type"),
                        "source_ref": source_ref,
                        "raw_text": row.get("raw_text"),
                        "raw_name": row.get("raw_name"),
                        "raw_unit": row.get("raw_unit"),
                        "raw_category": row.get("raw_category"),
                        "raw_quantity": row.get("raw_quantity"),
                        "raw_unit_price": row.get("raw_unit_price"),
                        "raw_total_price": row.get("raw_total_price"),
                        "context_before": chunk.get("context_before") or [],
                        "context_after": chunk.get("context_after") or [],
                        "section_labels": row.get("section_labels") or chunk.get("section_labels") or [],
                        "evidence_refs": evidence_refs,
                        "raw_columns": row.get("raw_columns") or {},
                        "span_offsets": {},
                        "table_signature": chunk.get("table_signature"),
                        "extraction_confidence": _coerce_confidence(selection.extraction_confidence),
                        "extraction_notes": [
                            "LLM extracted from raw document chunk.",
                            *([selection.extraction_note] if selection.extraction_note else []),
                        ],
                    }
                )
                candidate_origin_counter[candidate_origin] += 1

            chunk_selection_counts.append(chunk_selection_count)

        set_span_attributes(
            extract_span,
            {
                "shadow.candidate_count": len(extracted_candidates),
                "shadow.chunk_with_candidates_count": sum(1 for count in chunk_selection_counts if count > 0),
                "shadow.chunk_avg_selected_rows": (
                    round(sum(chunk_selection_counts) / len(chunk_selection_counts), 4)
                    if chunk_selection_counts
                    else 0.0
                ),
                "shadow.matched_deterministic_candidate_count": int(
                    candidate_origin_counter.get("matched_deterministic_candidate", 0)
                ),
                "shadow.agentic_only_candidate_count": int(
                    candidate_origin_counter.get("agentic_only_candidate", 0)
                ),
            },
        )
        _attach_span_json_samples(
            extract_span,
            {
                "candidates": _sample_candidate_records(extracted_candidates),
                "agentic_only_candidates": _sample_candidate_records(
                    [
                        candidate
                        for candidate in extracted_candidates
                        if candidate.get("candidate_origin") == "agentic_only_candidate"
                    ]
                ),
            },
        )
        mark_span_ok(extract_span)

    result = create_agentic_shadow_run(
        conn,
        created_by_profile_id=created_by_profile_id,
        input_batch_id=input_batch_id,
        payload={
            **payload,
            "candidates": extracted_candidates,
            "summary": {
                **(payload.get("summary") or {}),
                "chunk_count": len(chunks),
                "candidate_count": len(extracted_candidates),
            },
        },
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            update project_input_agentic_runs
            set
              summary = %s::jsonb,
              updated_at = now()
            where id = %s
            """,
            (
                _json(
                    _summary_with_observability(
                        {
                            **(payload.get("summary") or {}),
                            "chunk_count": len(chunks),
                            "candidate_count": len(extracted_candidates),
                            "candidate_origin_counts": result.get("candidate_origin_counts") or {},
                        },
                        trace_id,
                    ),
                    {},
                ),
                result["agentic_run_id"],
            ),
        )
    result["observability"] = _observability_payload(trace_id)
    result["_batch"] = batch
    result["_candidate_origin_counter"] = dict(candidate_origin_counter)
    result["_candidate_count"] = len(extracted_candidates)
    result["_chunk_count"] = len(chunks)
    return result


def extract_agentic_shadow_run(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    trace_id: str | None = None
    final_result: dict[str, Any] | None = None

    with start_as_current_span(
        "agentic_shadow_run",
        kind="CHAIN",
        attributes={
            "shadow.stage": "extract",
            "shadow.input_batch_id": input_batch_id,
            "shadow.model_name": str(payload.get("model_name") or _vertex_model()),
            "shadow.retrieval_strategy": str(payload.get("retrieval_strategy") or ""),
            "shadow.prompt_version": str(payload.get("prompt_version") or ""),
            **_agentic_shadow_comparison_attrs(
                payload=payload,
                input_batch_id=input_batch_id,
            ),
        },
    ) as root_span:
        trace_id = current_trace_id(root_span)
        try:
            set_span_attributes(
                root_span,
                _agentic_shadow_comparison_attrs(
                    payload=payload,
                    input_batch_id=input_batch_id,
                ),
            )
            result = _extract_agentic_shadow_run_impl(
                conn,
                created_by_profile_id=created_by_profile_id,
                input_batch_id=input_batch_id,
                payload=payload,
                trace_id=trace_id,
            )
            set_span_attributes(
                root_span,
                {
                    "run.success": True,
                    "shadow.stage": "extract",
                    "shadow.agentic_run_id": result.get("agentic_run_id") or "",
                    "shadow.chunk_count": result.get("_chunk_count") or 0,
                    "shadow.candidate_count": result.get("_candidate_count") or 0,
                    "shadow.matched_deterministic_candidate_count": int(
                        (result.get("_candidate_origin_counter") or {}).get("matched_deterministic_candidate", 0)
                    ),
                    "shadow.agentic_only_candidate_count": int(
                        (result.get("_candidate_origin_counter") or {}).get("agentic_only_candidate", 0)
                    ),
                },
            )
            mark_span_ok(root_span)
            final_result = {k: v for k, v in result.items() if not str(k).startswith("_")}
        except Exception as exc:
            mark_span_error(root_span, exc)
            raise

    force_flush()
    return final_result if final_result is not None else {}


def _qualify_agentic_shadow_run_impl(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    agentic_run_id: str,
    payload: dict[str, Any],
    trace_id: str | None,
) -> dict[str, Any]:
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
              c.candidate_origin,
              c.deterministic_normalized_supply_id
            from project_input_agentic_candidates c
            where c.agentic_run_id = %s
            order by c.created_at asc, c.id asc
            """,
            (agentic_run_id,),
        )
        candidates = cur.fetchall()

        with start_as_current_span(
            "shadow_qualification",
            kind="CHAIN",
            attributes={
                "shadow.candidate_count": len(candidates),
                "shadow.document_count": len({str(c.get("document_id")) for c in candidates}),
            },
        ) as qualification_span:
            label_counter: Counter[str] = Counter()
            qualified_supply_count = 0
            monitorable_supply_count = 0
            candidates_with_judgments: list[tuple[dict[str, Any], dict[str, Any]]] = []

            for candidate in candidates:
                judgment = _infer_judgment(candidate)
                candidates_with_judgments.append((candidate, judgment))
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

            set_span_attributes(
                qualification_span,
                {
                    "shadow.qualified_supply_count": qualified_supply_count,
                    "shadow.rejected_candidate_count": max(len(candidates) - qualified_supply_count, 0),
                    "shadow.monitorable_candidate_count": monitorable_supply_count,
                    "shadow.heading_or_chapter_count": int(label_counter.get("heading_or_chapter", 0)),
                    "shadow.scope_or_activity_count": int(label_counter.get("scope_or_activity", 0)),
                    "shadow.bundle_or_mixed_scope_count": int(label_counter.get("bundle_or_mixed_scope", 0)),
                    "shadow.labor_or_service_count": int(label_counter.get("labor_or_service", 0)),
                    "shadow.unresolved_count": int(label_counter.get("unresolved", 0)),
                    "shadow.qualification_ratio": (
                        round(qualified_supply_count / len(candidates), 4) if candidates else 0.0
                    ),
                },
            )
            _attach_span_json_samples(
                qualification_span,
                {
                    "qualified_candidates": _sample_judgment_records(
                        candidates_with_judgments,
                        predicate=lambda _candidate, judgment: bool(judgment.get("is_qualified")),
                    ),
                    "rejected_candidates": _sample_judgment_records(
                        candidates_with_judgments,
                        predicate=lambda _candidate, judgment: not bool(judgment.get("is_qualified")),
                    ),
                    "unresolved_candidates": _sample_judgment_records(
                        candidates_with_judgments,
                        predicate=lambda _candidate, judgment: judgment.get("judgment_label") == "unresolved",
                    ),
                },
            )
            mark_span_ok(qualification_span)

        deterministic_supply_ids = sorted(
            {
                str(candidate.get("deterministic_normalized_supply_id") or "").strip()
                for candidate, judgment in candidates_with_judgments
                if judgment.get("is_qualified") and str(candidate.get("deterministic_normalized_supply_id") or "").strip()
            }
        )
        configured_sources_by_supply_id = _load_supply_price_sources_by_supply_id(conn, deterministic_supply_ids)

        artifacts = _build_shadow_supply_artifacts(
            candidates_with_judgments,
            agentic_run_id=agentic_run_id,
            input_batch_id=input_batch_id,
            project_id=str(batch.get("project_id")) if batch.get("project_id") else None,
            configured_sources_by_supply_id=configured_sources_by_supply_id,
        )

        with start_as_current_span(
            "shadow_normalization",
            kind="CHAIN",
            attributes={
                "shadow.qualified_supply_count": qualified_supply_count,
                "shadow.shadow_supply_count": len(artifacts["supplies"]),
                "shadow.normalization_ratio": (
                    round(len(artifacts["supplies"]) / qualified_supply_count, 4)
                    if qualified_supply_count
                    else 0.0
                ),
                "shadow.linked_to_deterministic_supply_count": sum(
                    1 for supply in artifacts["supplies"] if supply.get("deterministic_normalized_supply_id")
                ),
            },
        ) as normalization_span:
            _attach_span_json_samples(
                normalization_span,
                {
                    "shadow_supplies": _sample_mapping_records(
                        artifacts["supplies"],
                        artifacts["mappings"],
                        mapped_only=None,
                    ),
                },
            )
            cur.execute("delete from project_input_agentic_row_links where agentic_run_id = %s", (agentic_run_id,))
            cur.execute("delete from project_input_agentic_mappings where agentic_run_id = %s", (agentic_run_id,))
            cur.execute("delete from project_input_agentic_supplies where agentic_run_id = %s", (agentic_run_id,))

            for supply in artifacts["supplies"]:
                cur.execute(
                    """
                    insert into project_input_agentic_supplies (
                      id, agentic_run_id, input_batch_id, project_id, pipeline_variant, display_name,
                      canonical_name, canonical_unit, canonical_category, monitorability_status,
                      market_mapping_status, quantity_total, unit_price_reference, total_price_reference,
                      source_document_ids, source_extracted_row_ids, deterministic_normalized_supply_id,
                      confidence, rationale_summary, retrieval_evidence, mapping_candidate
                    )
                    values (
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                      %s::jsonb, %s::jsonb, %s, %s, %s, %s::jsonb, %s::jsonb
                    )
                    """,
                    (
                        supply["id"], supply["agentic_run_id"], supply["input_batch_id"], supply["project_id"],
                        supply["pipeline_variant"], supply["display_name"], supply["canonical_name"],
                        supply["canonical_unit"], supply["canonical_category"], supply["monitorability_status"],
                        supply["market_mapping_status"], supply["quantity_total"], supply["unit_price_reference"],
                        supply["total_price_reference"], _json(supply["source_document_ids"], []),
                        _json(supply["source_extracted_row_ids"], []), supply["deterministic_normalized_supply_id"],
                        supply["confidence"], supply["rationale_summary"], _json(supply["retrieval_evidence"], []),
                        _json(supply["mapping_candidate"], {}),
                    ),
                )

            for row_link in artifacts["row_links"]:
                cur.execute(
                    """
                    insert into project_input_agentic_row_links (
                      id, agentic_run_id, candidate_id, extracted_row_id, agentic_supply_id, link_reason
                    )
                    values (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        row_link["id"], row_link["agentic_run_id"], row_link["candidate_id"],
                        row_link["extracted_row_id"], row_link["agentic_supply_id"], row_link["link_reason"],
                    ),
                )
            mark_span_ok(normalization_span)

        with start_as_current_span(
            "shadow_market_mapping",
            kind="CHAIN",
            attributes={
                "shadow.shadow_supply_count": len(artifacts["supplies"]),
                "shadow.mapped_shadow_supply_count": artifacts["summary"].get("mapped_shadow_supply_count", 0),
                "shadow.unmapped_shadow_supply_count": artifacts["summary"].get("unmapped_shadow_supply_count", 0),
                "shadow.monitorable_shadow_supply_count": artifacts["summary"].get("monitorable_shadow_supply_count", 0),
                "shadow.classified_supply_count": sum(artifacts["summary"].get("supply_class_counts", {}).values()),
                "shadow.supply_class_counts_json": _json(artifacts["summary"].get("supply_class_counts"), {}),
            },
        ) as mapping_span:
            for mapping in artifacts["mappings"]:
                cur.execute(
                    """
                    insert into project_input_agentic_mappings (
                      id, agentic_run_id, input_batch_id, project_id, agentic_supply_id, mapping_status,
                      mapping_strategy, series_key, series_id, source_name, source_url, confidence, rationale_summary
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        mapping["id"], mapping["agentic_run_id"], mapping["input_batch_id"], mapping["project_id"],
                        mapping["agentic_supply_id"], mapping["mapping_status"], mapping["mapping_strategy"],
                        mapping["series_key"], mapping["series_id"], mapping["source_name"], mapping["source_url"],
                        mapping["confidence"], mapping["rationale_summary"],
                    ),
                )
            _attach_span_json_samples(
                mapping_span,
                {
                    "mapped_supplies": _sample_mapping_records(
                        artifacts["supplies"],
                        artifacts["mappings"],
                        mapped_only=True,
                    ),
                    "unmapped_supplies": _sample_mapping_records(
                        artifacts["supplies"],
                        artifacts["mappings"],
                        mapped_only=False,
                    ),
                },
            )
            mark_span_ok(mapping_span)

        summary = {
            **(run.get("summary") or {}),
            **(payload.get("summary") or {}),
            "candidate_count": len(candidates),
            "qualified_supply_count": qualified_supply_count,
            "rejected_candidate_count": max(len(candidates) - qualified_supply_count, 0),
            "monitorable_supply_count": monitorable_supply_count,
            "judgment_counts": _summary_from_counter(label_counter),
            **artifacts["summary"],
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
                _json(_summary_with_observability(summary, trace_id), {}),
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
        "observability": _observability_payload(trace_id),
        "_artifacts_summary": artifacts["summary"],
    }


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
    trace_id: str | None = None
    final_result: dict[str, Any] | None = None

    with start_as_current_span(
        "agentic_shadow_run",
        kind="CHAIN",
        attributes={
            "shadow.stage": "qualify",
            "shadow.input_batch_id": input_batch_id,
            "shadow.agentic_run_id": agentic_run_id,
            "shadow.model_name": str(payload.get("model_name") or ""),
            "shadow.retrieval_strategy": str(payload.get("retrieval_strategy") or ""),
            "shadow.prompt_version": str(payload.get("prompt_version") or ""),
            **_agentic_shadow_comparison_attrs(
                payload={"pipeline_variant": "agentic_shadow", **payload},
                input_batch_id=input_batch_id,
            ),
        },
    ) as root_span:
        trace_id = current_trace_id(root_span)
        try:
            set_span_attributes(
                root_span,
                _agentic_shadow_comparison_attrs(
                    payload={"pipeline_variant": "agentic_shadow", **payload},
                    input_batch_id=input_batch_id,
                ),
            )
            result = _qualify_agentic_shadow_run_impl(
                conn,
                created_by_profile_id=created_by_profile_id,
                input_batch_id=input_batch_id,
                agentic_run_id=agentic_run_id,
                payload=payload,
                trace_id=trace_id,
            )
            set_span_attributes(
                root_span,
                {
                    "run.success": True,
                    "shadow.stage": "qualify",
                    "shadow.candidate_count": result.get("candidate_count") or 0,
                    "shadow.qualified_supply_count": result.get("qualified_supply_count") or 0,
                    "shadow.rejected_candidate_count": result.get("rejected_candidate_count") or 0,
                    "shadow.monitorable_candidate_count": result.get("monitorable_supply_count") or 0,
                    "shadow.shadow_supply_count": (result.get("_artifacts_summary") or {}).get("shadow_supply_count", 0),
                    "shadow.mapped_shadow_supply_count": (result.get("_artifacts_summary") or {}).get("mapped_shadow_supply_count", 0),
                    "shadow.unmapped_shadow_supply_count": (result.get("_artifacts_summary") or {}).get("unmapped_shadow_supply_count", 0),
                },
            )
            mark_span_ok(root_span)
            final_result = {k: v for k, v in result.items() if not str(k).startswith("_")}
        except Exception as exc:
            mark_span_error(root_span, exc)
            raise

    force_flush()
    return final_result if final_result is not None else {}


def run_agentic_shadow_pipeline(
    conn: Connection,
    *,
    created_by_profile_id: str,
    input_batch_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    trace_id: str | None = None
    final_result: dict[str, Any] | None = None
    qualification_payload = {
        "project_id": payload.get("project_id"),
        "model_name": payload.get("qualification_model_name") or "shadow_qualification_heuristic_v1",
        "retrieval_strategy": payload.get("qualification_retrieval_strategy") or payload.get("retrieval_strategy"),
        "prompt_version": payload.get("qualification_prompt_version") or "heuristic_seed_v1",
        "summary": payload.get("qualification_summary") or payload.get("summary") or {},
        "benchmark_dataset": payload.get("benchmark_dataset"),
        "benchmark_instance_id": payload.get("benchmark_instance_id"),
        "pipeline_version": payload.get("pipeline_version"),
    }

    with start_as_current_span(
        "agentic_shadow_run",
        kind="CHAIN",
        attributes={
            "shadow.stage": "pipeline",
            "shadow.input_batch_id": input_batch_id,
            "shadow.model_name": str(payload.get("model_name") or _vertex_model()),
            "shadow.retrieval_strategy": str(payload.get("retrieval_strategy") or ""),
            "shadow.prompt_version": str(payload.get("prompt_version") or ""),
            **_agentic_shadow_comparison_attrs(payload=payload, input_batch_id=input_batch_id),
        },
    ) as root_span:
        trace_id = current_trace_id(root_span)
        try:
            extract_result = _extract_agentic_shadow_run_impl(
                conn,
                created_by_profile_id=created_by_profile_id,
                input_batch_id=input_batch_id,
                payload=payload,
                trace_id=trace_id,
            )
            batch = extract_result.get("_batch") or {}
            set_span_attributes(
                root_span,
                _agentic_shadow_comparison_attrs(
                    payload=payload,
                    input_batch_id=input_batch_id,
                    project_id=str(batch.get("project_id") or "") or None,
                ),
            )
            qualify_result = _qualify_agentic_shadow_run_impl(
                conn,
                created_by_profile_id=created_by_profile_id,
                input_batch_id=input_batch_id,
                agentic_run_id=str(extract_result["agentic_run_id"]),
                payload=qualification_payload,
                trace_id=trace_id,
            )
            set_span_attributes(
                root_span,
                {
                    "run.success": True,
                    "shadow.stage": "pipeline",
                    "shadow.agentic_run_id": extract_result.get("agentic_run_id") or "",
                    "shadow.chunk_count": extract_result.get("_chunk_count") or 0,
                    "shadow.candidate_count": qualify_result.get("candidate_count") or 0,
                    "shadow.qualified_supply_count": qualify_result.get("qualified_supply_count") or 0,
                    "shadow.rejected_candidate_count": qualify_result.get("rejected_candidate_count") or 0,
                    "shadow.monitorable_candidate_count": qualify_result.get("monitorable_supply_count") or 0,
                    "shadow.shadow_supply_count": (qualify_result.get("_artifacts_summary") or {}).get("shadow_supply_count", 0),
                    "shadow.mapped_shadow_supply_count": (qualify_result.get("_artifacts_summary") or {}).get("mapped_shadow_supply_count", 0),
                    "shadow.unmapped_shadow_supply_count": (qualify_result.get("_artifacts_summary") or {}).get("unmapped_shadow_supply_count", 0),
                },
            )
            mark_span_ok(root_span)
            final_result = {
                **extract_result,
                **{k: v for k, v in qualify_result.items() if not str(k).startswith("_")},
            }
        except Exception as exc:
            mark_span_error(root_span, exc)
            raise

    force_flush()
    return final_result if final_result is not None else {}


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

        cur.execute(
            """
            select
              s.id,
              s.display_name,
              s.canonical_name,
              s.canonical_unit,
              s.canonical_category,
              s.monitorability_status,
              s.market_mapping_status,
              s.quantity_total,
              s.total_price_reference,
              s.deterministic_normalized_supply_id,
              s.confidence,
              s.rationale_summary
            from project_input_agentic_supplies s
            where s.agentic_run_id = %s
            order by s.total_price_reference desc nulls last, s.created_at asc
            """,
            (agentic_run_id,),
        )
        supplies = cur.fetchall()

        cur.execute(
            """
            select
              m.id,
              m.agentic_supply_id,
              m.mapping_status,
              m.mapping_strategy,
              m.series_key,
              m.source_name,
              m.confidence,
              m.rationale_summary
            from project_input_agentic_mappings m
            where m.agentic_run_id = %s
            order by m.created_at asc
            """,
            (agentic_run_id,),
        )
        mappings = cur.fetchall()

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
            "supplies": supplies,
            "mappings": mappings,
        },
        "comparison": comparison,
        "provenance": {
            "document_count": deterministic_counts.get("document_count", 0),
            "candidate_count": int(agentic_summary.get("candidate_count", 0)),
        },
    }
