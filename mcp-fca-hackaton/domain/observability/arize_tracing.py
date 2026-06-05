from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any


class _NoopSpan:
    def set_attribute(self, key: str, value: Any) -> None:
        return None

    def set_status(self, status: Any) -> None:
        return None

    def record_exception(self, exc: BaseException) -> None:
        return None

    def add_event(self, name: str, attributes: dict[str, Any] | None = None) -> None:
        return None

    def get_span_context(self):
        class _Ctx:
            trace_id = 0

        return _Ctx()


_NOOP_SPAN = _NoopSpan()
_INITIALIZED = False
_ENABLED = False
_TRACER = None
_TRACE_API = None
_STATUS = None
_STATUS_CODE = None
_TRACER_PROVIDER = None
_PROJECT_ID: str | None = None
_INIT_REASON = "not_initialized"


logger = logging.getLogger("mcp-arize-tracing")


def _normalize_attr_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        normalized = [str(item) for item in value if item is not None]
        return normalized
    return str(value)


def _resolve_or_create_project(
    *,
    api_key: str,
    space_id: str,
    project_name: str,
) -> str:
    import httpx

    headers = {"Authorization": f"Bearer {api_key}"}
    timeout = httpx.Timeout(15.0, connect=10.0)

    with httpx.Client(timeout=timeout, headers=headers) as client:
        list_resp = client.get(
            "https://api.arize.com/v2/projects",
            params={"space": space_id, "limit": 100},
        )
        list_resp.raise_for_status()
        payload = list_resp.json()
        projects = payload.get("projects") or payload.get("data") or []
        for project in projects:
            if str(project.get("name") or "").strip() == project_name:
                project_id = str(project.get("id") or "").strip()
                if project_id:
                    return project_id

        create_payloads = [
            {"name": project_name, "space": space_id},
            {"name": project_name, "space_id": space_id},
        ]
        last_error: Exception | None = None
        for create_payload in create_payloads:
            try:
                create_resp = client.post(
                    "https://api.arize.com/v2/projects",
                    json=create_payload,
                )
                create_resp.raise_for_status()
                created = create_resp.json()
                project_id = str(created.get("id") or "").strip()
                if project_id:
                    return project_id
            except Exception as exc:  # pragma: no cover - exercised live
                last_error = exc

        if last_error is not None:
            raise last_error
        raise RuntimeError("Arize project resolution returned no project id")


def _ensure_initialized() -> None:
    global _INITIALIZED, _ENABLED, _TRACER, _TRACE_API, _STATUS, _STATUS_CODE, _TRACER_PROVIDER, _PROJECT_ID, _INIT_REASON
    if _INITIALIZED:
        return
    _INITIALIZED = True

    api_key = (os.getenv("ARIZE_API_KEY") or "").strip()
    space_id = (os.getenv("ARIZE_SPACE_ID") or "").strip()
    project_name = (os.getenv("ARIZE_PROJECT_NAME") or "nexum-supply-intelligence").strip()
    if not api_key or not space_id or not project_name:
        _INIT_REASON = "missing_env"
        logger.warning(
            "Arize tracing disabled: missing env (api_key=%s space_id=%s project_name=%s)",
            bool(api_key),
            bool(space_id),
            bool(project_name),
        )
        return

    try:
        from arize.otel import register
        from opentelemetry import trace
        from opentelemetry.trace import Status, StatusCode
    except Exception as exc:
        _INIT_REASON = f"import_failed:{exc.__class__.__name__}"
        logger.exception("Arize tracing import failed")
        return

    try:
        _PROJECT_ID = _resolve_or_create_project(
            api_key=api_key,
            space_id=space_id,
            project_name=project_name,
        )
        logger.info(
            "Arize project resolved: name=%s id=%s",
            project_name,
            _PROJECT_ID,
        )
    except Exception as exc:
        _INIT_REASON = f"project_resolution_failed:{exc.__class__.__name__}"
        logger.exception("Arize project resolution failed")
        return

    register_kwargs: dict[str, Any] = {
        "space_id": space_id,
        "api_key": api_key,
        "project_name": project_name,
    }
    endpoint = (os.getenv("ARIZE_COLLECTOR_ENDPOINT") or "").strip()
    if endpoint:
        register_kwargs["endpoint"] = endpoint

    try:
        tracer_provider = register(**register_kwargs)
        _TRACER_PROVIDER = tracer_provider
        _TRACER = trace.get_tracer("nexum.supply-intelligence", "0.1.0")
        _TRACE_API = trace
        _STATUS = Status
        _STATUS_CODE = StatusCode
        _ENABLED = tracer_provider is not None
        _INIT_REASON = "enabled" if _ENABLED else "register_returned_none"
        logger.info(
            "Arize tracing initialization result: enabled=%s project=%s project_id=%s",
            _ENABLED,
            project_name,
            _PROJECT_ID,
        )
    except Exception as exc:
        _ENABLED = False
        _INIT_REASON = f"register_failed:{exc.__class__.__name__}"
        logger.exception("Arize tracing registration failed")


def tracing_enabled() -> bool:
    _ensure_initialized()
    return _ENABLED and _TRACER is not None


def tracing_status() -> dict[str, Any]:
    _ensure_initialized()
    return {
        "enabled": tracing_enabled(),
        "reason": _INIT_REASON,
        "project_name": (os.getenv("ARIZE_PROJECT_NAME") or "nexum-supply-intelligence").strip(),
        "project_id": _PROJECT_ID,
    }


def force_flush(timeout_millis: int = 10000) -> bool:
    _ensure_initialized()
    if not _ENABLED or _TRACER_PROVIDER is None:
        return False
    try:
        return bool(_TRACER_PROVIDER.force_flush(timeout_millis=timeout_millis))
    except Exception:
        logger.exception("Arize trace flush failed")
        return False


@contextmanager
def start_as_current_span(
    name: str,
    *,
    kind: str = "CHAIN",
    attributes: dict[str, Any] | None = None,
):
    _ensure_initialized()
    if not tracing_enabled():
        yield _NOOP_SPAN
        return

    assert _TRACER is not None
    with _TRACER.start_as_current_span(name) as span:
        span.set_attribute("openinference.span.kind", kind)
        if attributes:
            set_span_attributes(span, attributes)
        yield span


def set_span_attributes(span: Any, attributes: dict[str, Any] | None) -> None:
    if not attributes:
        return
    for key, value in attributes.items():
        normalized = _normalize_attr_value(value)
        if normalized is None:
            continue
        span.set_attribute(key, normalized)


def mark_span_ok(span: Any) -> None:
    if span is _NOOP_SPAN or _STATUS is None or _STATUS_CODE is None:
        return
    span.set_status(_STATUS(_STATUS_CODE.OK))


def mark_span_error(span: Any, exc: BaseException) -> None:
    if span is _NOOP_SPAN:
        return
    span.record_exception(exc)
    if _STATUS is not None and _STATUS_CODE is not None:
        span.set_status(_STATUS(_STATUS_CODE.ERROR, str(exc)))


def current_trace_id(span: Any) -> str | None:
    try:
        trace_id = int(span.get_span_context().trace_id)
    except Exception:
        return None
    if not trace_id:
        return None
    return f"{trace_id:032x}"
