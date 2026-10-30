"""Fail-closed operator access configuration (spec-22).

The live workspace has exactly one identity. This module validates the
deployment inputs that identify it before any live adapter, HTTP route or
worker recovery graph is constructed. It deliberately has no FastAPI or
Supabase imports so replay-only processes can import the package without
touching either dependency.
"""

from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass
from urllib.parse import urlparse
from uuid import UUID

_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_MAX_VERIFICATION_TIMEOUT_SECONDS = 30.0
_MAX_VERIFICATION_CONNECTIONS = 100


class AccessConfigurationError(RuntimeError):
    """Operator/Auth configuration is missing or unsafe.

    Messages are safe to log: they name the setting, never its value.
    """


@dataclass(frozen=True)
class OperatorAccessConfig:
    """Validated settings for the single live operator."""

    supabase_url: str
    operator_user_id: str
    auth_publishable_key: str
    verification_timeout_seconds: float = 5.0
    verification_max_connections: int = 10

    @classmethod
    def from_settings(cls, source) -> "OperatorAccessConfig":
        """Validate the live operator settings.

        Raises ``AccessConfigurationError`` when live HTTP must not start.
        Callers construct this before ``Container.production()`` so a
        misconfigured deployment never reaches a business adapter.
        """

        supabase_url = (getattr(source, "supabase_url", "") or "").strip()
        operator_user_id = (getattr(source, "operator_user_id", "") or "").strip()
        publishable_key = (
            getattr(source, "supabase_auth_publishable_key", "") or ""
        ).strip()
        service_key = (getattr(source, "supabase_service_key", "") or "").strip()
        timeout = float(
            getattr(source, "access_verification_timeout_seconds", 5.0) or 0.0
        )
        max_connections = int(
            getattr(source, "access_verification_max_connections", 10) or 0
        )

        _validate_supabase_url(supabase_url)
        canonical_operator = _validate_operator_id(operator_user_id)
        _validate_publishable_key(publishable_key, service_key)

        if not 0.0 < timeout <= _MAX_VERIFICATION_TIMEOUT_SECONDS:
            raise AccessConfigurationError(
                "ACCESS_VERIFICATION_TIMEOUT_SECONDS must be between 0 and 30"
            )
        if not 1 <= max_connections <= _MAX_VERIFICATION_CONNECTIONS:
            raise AccessConfigurationError(
                "ACCESS_VERIFICATION_MAX_CONNECTIONS must be between 1 and 100"
            )

        return cls(
            supabase_url=supabase_url.rstrip("/"),
            operator_user_id=canonical_operator,
            auth_publishable_key=publishable_key,
            verification_timeout_seconds=timeout,
            verification_max_connections=max_connections,
        )


def _validate_supabase_url(value: str) -> None:
    if not value:
        raise AccessConfigurationError(
            "SUPABASE_URL is required when live HTTP is mounted"
        )
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise AccessConfigurationError("SUPABASE_URL must be an absolute http(s) URL")
    if parsed.scheme != "https" and parsed.hostname not in _LOCAL_HOSTS:
        raise AccessConfigurationError(
            "SUPABASE_URL must use https outside localhost"
        )


def _validate_operator_id(value: str) -> str:
    if not value:
        raise AccessConfigurationError(
            "OPERATOR_USER_ID is required when live HTTP is mounted"
        )
    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise AccessConfigurationError(
            "OPERATOR_USER_ID must be a valid UUID"
        ) from exc


def _validate_publishable_key(value: str, service_key: str) -> None:
    if not value:
        raise AccessConfigurationError(
            "SUPABASE_AUTH_PUBLISHABLE_KEY is required when live HTTP is mounted"
        )
    if service_key and value == service_key:
        raise AccessConfigurationError(
            "SUPABASE_AUTH_PUBLISHABLE_KEY must not be the service-role key"
        )
    if value.startswith("sb_secret_"):
        raise AccessConfigurationError(
            "SUPABASE_AUTH_PUBLISHABLE_KEY must not be a secret key"
        )
    if _jwt_role(value) == "service_role":
        raise AccessConfigurationError(
            "SUPABASE_AUTH_PUBLISHABLE_KEY must not be a service-role token"
        )


def _jwt_role(value: str) -> str | None:
    """Read the role claim only to reject a service-role key at startup.

    Access tokens are never authorized from decoded claims; this helper is
    limited to deployment-key validation.
    """

    parts = value.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1]
    payload += "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload.encode("ascii"))
        data = json.loads(decoded)
    except (ValueError, binascii.Error, UnicodeDecodeError):
        return None
    role = data.get("role") if isinstance(data, dict) else None
    return role if isinstance(role, str) else None
