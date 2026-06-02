from __future__ import annotations

import os
from dataclasses import dataclass

from fastapi import HTTPException, Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


@dataclass(frozen=True)
class Principal:
    uid: str
    email: str | None


def _auth_required() -> bool:
    raw = (os.getenv("FIREBASE_AUTH_REQUIRED") or "true").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _project_id() -> str | None:
    value = (os.getenv("FIREBASE_PROJECT_ID") or "").strip()
    return value or None


def _extract_bearer(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header[7:].strip()
    return token or None


def resolve_principal(request: Request) -> Principal:
    token = _extract_bearer(request)

    if not token:
        if _auth_required():
            raise HTTPException(status_code=401, detail="Missing Firebase bearer token.")
        return Principal(uid="anonymous", email=None)

    try:
        decoded = id_token.verify_firebase_token(
            token,
            google_requests.Request(),
            audience=_project_id(),
        )
    except Exception as exc:  # pragma: no cover - google-auth internals
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}") from exc

    uid = str(
        decoded.get("uid")
        or decoded.get("user_id")
        or decoded.get("sub")
        or "",
    ).strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Firebase token missing uid claim.")

    email = decoded.get("email")
    return Principal(uid=uid, email=str(email) if email else None)
