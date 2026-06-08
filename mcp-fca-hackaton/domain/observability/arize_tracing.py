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
_INIT_REASON = "not_initialized"


logger = logging.getLogger("mcp-phoenix-tracing")


def _normalize_attr_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        normalized = [str(item) for item in value if item is not None]
        return normalized
    return str(value)


def _default_pipeline_version() -> str:
    for env_name in ("PIPELINE_VERSION", "K_REVISION", "GIT_SHA", "COMMIT_SHA"):
        value = (os.getenv(env_name) or "").strip()
        if value:
            return value
    return "dev"


def _default_benchmark_dataset() -> str:
    return (os.getenv("NEXUM_BENCHMARK_DATASET") or "contractual-projects-v1").strip()


def comparison_attributes(
    *,
    pipeline_variant: str,
    project_id: str | None = None,
    input_batch_id: str | None = None,
    benchmark_dataset: str | None = None,
    benchmark_instance_id: str | None = None,
    pipeline_version: str | None = None,
) -> dict[str, Any]:
    resolved_project_id = (project_id or "").strip() or None
    resolved_input_batch_id = (input_batch_id or "").strip() or None
    resolved_dataset = (benchmark_dataset or _default_benchmark_dataset()).strip()
    resolved_instance = (
        (benchmark_instance_id or "").strip()
        or resolved_project_id
        or resolved_input_batch_id
    )
    resolved_session_id = resolved_input_batch_id or resolved_project_id or resolved_instance

    attributes: dict[str, Any] = {
        "pipeline.variant": pipeline_variant,
        "pipeline.version": (pipeline_version or _default_pipeline_version()).strip(),
        "benchmark.dataset": resolved_dataset,
    }
    if resolved_project_id:
        attributes["project.id"] = resolved_project_id
    if resolved_input_batch_id:
        attributes["input_batch.id"] = resolved_input_batch_id
    if resolved_instance:
        attributes["benchmark.instance_id"] = resolved_instance
    if resolved_session_id:
        attributes["session.id"] = resolved_session_id
    return attributes


def _read_env(primary: str, legacy: str) -> str:
    return (os.getenv(primary) or os.getenv(legacy) or "").strip()


def _normalize_collector_endpoint(endpoint: str) -> str:
    normalized = endpoint.rstrip("/")
    if normalized.endswith("/v1/traces"):
        return normalized
    return f"{normalized}/v1/traces"


def _ensure_initialized() -> None:
    global _INITIALIZED, _ENABLED, _TRACER, _TRACE_API, _STATUS, _STATUS_CODE, _TRACER_PROVIDER, _INIT_REASON
    if _INITIALIZED:
        return
    _INITIALIZED = True

    api_key = _read_env("PHOENIX_API_KEY", "ARIZE_API_KEY")
    endpoint = _read_env("PHOENIX_COLLECTOR_ENDPOINT", "ARIZE_COLLECTOR_ENDPOINT")
    project_name = _read_env("PHOENIX_PROJECT_NAME", "ARIZE_PROJECT_NAME") or "nexum-supply-intelligence"
    if not api_key or not endpoint or not project_name:
        _INIT_REASON = "missing_env"
        logger.warning(
            "Phoenix tracing disabled: missing env (api_key=%s endpoint=%s project_name=%s)",
            bool(api_key),
            bool(endpoint),
            bool(project_name),
        )
        return

    try:
        from phoenix.otel import register
        from opentelemetry import trace
        from opentelemetry.trace import Status, StatusCode
    except Exception as exc:
        _INIT_REASON = f"import_failed:{exc.__class__.__name__}"
        logger.exception("Phoenix tracing import failed")
        return

    register_kwargs: dict[str, Any] = {
        "api_key": api_key,
        "project_name": project_name,
        "endpoint": _normalize_collector_endpoint(endpoint),
    }

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
            "Phoenix tracing initialization result: enabled=%s project=%s endpoint=%s",
            _ENABLED,
            project_name,
            register_kwargs["endpoint"],
        )
    except Exception as exc:
        _ENABLED = False
        _INIT_REASON = f"register_failed:{exc.__class__.__name__}"
        logger.exception("Phoenix tracing registration failed")


def tracing_enabled() -> bool:
    _ensure_initialized()
    return _ENABLED and _TRACER is not None


def tracing_status() -> dict[str, Any]:
    _ensure_initialized()
    return {
        "enabled": tracing_enabled(),
        "reason": _INIT_REASON,
        "project_name": _read_env("PHOENIX_PROJECT_NAME", "ARIZE_PROJECT_NAME") or "nexum-supply-intelligence",
        "collector_endpoint": _normalize_collector_endpoint(_read_env("PHOENIX_COLLECTOR_ENDPOINT", "ARIZE_COLLECTOR_ENDPOINT")) if _read_env("PHOENIX_COLLECTOR_ENDPOINT", "ARIZE_COLLECTOR_ENDPOINT") else None,
    }


def force_flush(timeout_millis: int = 10000) -> bool:
    _ensure_initialized()
    if not _ENABLED or _TRACER_PROVIDER is None:
        return False
    try:
        return bool(_TRACER_PROVIDER.force_flush(timeout_millis=timeout_millis))
    except Exception:
        logger.exception("Phoenix trace flush failed")
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
