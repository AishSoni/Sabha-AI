"""Operator configuration fails closed before live adapters exist (spec-22)."""

from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.modules.access.domain.policy import (
    AccessConfigurationError,
    OperatorAccessConfig,
)

OPERATOR_ID = "11111111-1111-4111-8111-111111111111"


def settings(**overrides):
    values = {
        "supabase_url": "https://project.supabase.co",
        "operator_user_id": OPERATOR_ID,
        "supabase_auth_publishable_key": "sb_publishable_public",
        "supabase_service_key": "service-secret",
        "access_verification_timeout_seconds": 5.0,
        "access_verification_max_connections": 10,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def jwt_with_role(role: str) -> str:
    def part(payload: dict) -> str:
        encoded = base64.urlsafe_b64encode(
            json.dumps(payload).encode("utf-8")
        ).decode("ascii")
        return encoded.rstrip("=")

    return f"{part({'alg': 'HS256'})}.{part({'role': role})}.signature"


def test_accepts_a_valid_operator_configuration():
    config = OperatorAccessConfig.from_settings(settings())

    assert config.supabase_url == "https://project.supabase.co"
    assert config.operator_user_id == OPERATOR_ID
    assert config.auth_publishable_key == "sb_publishable_public"


def test_canonicalizes_the_operator_uuid():
    config = OperatorAccessConfig.from_settings(
        settings(operator_user_id=OPERATOR_ID.upper())
    )
    assert config.operator_user_id == OPERATOR_ID


def test_localhost_may_use_http():
    config = OperatorAccessConfig.from_settings(
        settings(supabase_url="http://127.0.0.1:54321/")
    )
    assert config.supabase_url == "http://127.0.0.1:54321"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"operator_user_id": ""}, "OPERATOR_USER_ID"),
        ({"operator_user_id": "not-a-uuid"}, "OPERATOR_USER_ID"),
        ({"supabase_auth_publishable_key": ""}, "SUPABASE_AUTH_PUBLISHABLE_KEY"),
        (
            {"supabase_auth_publishable_key": "service-secret"},
            "service-role",
        ),
        (
            {"supabase_auth_publishable_key": "sb_secret_abc"},
            "secret key",
        ),
        (
            {"supabase_auth_publishable_key": jwt_with_role("service_role")},
            "service-role",
        ),
        ({"supabase_url": ""}, "SUPABASE_URL"),
        ({"supabase_url": "https://"}, "SUPABASE_URL"),
        (
            {"supabase_url": "http://project.supabase.co"},
            "https outside localhost",
        ),
        ({"access_verification_timeout_seconds": 0}, "TIMEOUT"),
        ({"access_verification_max_connections": 0}, "MAX_CONNECTIONS"),
    ],
)
def test_rejects_unsafe_or_missing_configuration(overrides, message):
    with pytest.raises(AccessConfigurationError) as excinfo:
        OperatorAccessConfig.from_settings(settings(**overrides))

    assert message in str(excinfo.value)
    assert "service-secret" not in str(excinfo.value)


def test_accepts_a_legacy_anon_key():
    config = OperatorAccessConfig.from_settings(
        settings(supabase_auth_publishable_key=jwt_with_role("anon"))
    )
    assert config.auth_publishable_key


def test_a_custom_operator_id_is_required_not_a_derived_one():
    with pytest.raises(AccessConfigurationError):
        OperatorAccessConfig.from_settings(
            settings(operator_user_id=str(uuid4()) + "-extra")
        )
