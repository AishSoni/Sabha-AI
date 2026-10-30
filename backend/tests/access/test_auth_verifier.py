"""The Supabase Auth verifier is bounded, uncached and fail-closed."""

from __future__ import annotations

import httpx
import pytest

from app.modules.access.application.contracts import (
    AccessUnavailable,
    InvalidAccessToken,
)
from app.modules.access.infrastructure.supabase_auth import SupabaseAuthVerifier

OPERATOR_ID = "11111111-1111-4111-8111-111111111111"


def build(handler):
    return SupabaseAuthVerifier(
        supabase_url="https://project.supabase.co/",
        publishable_key="sb_publishable_public",
        timeout_seconds=2.0,
        max_connections=4,
        transport=httpx.MockTransport(handler),
    )


async def test_verifies_against_the_configured_project_with_both_headers():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": OPERATOR_ID})

    verifier = build(handler)
    identity = await verifier.verify("access-token")

    assert identity.user_id == OPERATOR_ID
    assert len(seen) == 1
    request = seen[0]
    assert str(request.url) == "https://project.supabase.co/auth/v1/user"
    assert request.headers["apikey"] == "sb_publishable_public"
    assert request.headers["authorization"] == "Bearer access-token"
    assert request.headers["accept"] == "application/json"

    await verifier.aclose()


@pytest.mark.parametrize("status", [400, 401, 403])
async def test_invalid_token_statuses_are_denials(status):
    verifier = build(lambda request: httpx.Response(status))
    with pytest.raises(InvalidAccessToken):
        await verifier.verify("bad-token")
    await verifier.aclose()


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
async def test_service_statuses_are_unavailable(status):
    verifier = build(lambda request: httpx.Response(status))
    with pytest.raises(AccessUnavailable):
        await verifier.verify("some-token")
    await verifier.aclose()


async def test_timeout_is_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow auth", request=request)

    verifier = build(handler)
    with pytest.raises(AccessUnavailable):
        await verifier.verify("some-token")
    await verifier.aclose()


async def test_network_failure_is_unavailable():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    verifier = build(handler)
    with pytest.raises(AccessUnavailable):
        await verifier.verify("some-token")
    await verifier.aclose()


async def test_redirect_is_not_followed_and_is_unavailable():
    verifier = build(
        lambda request: httpx.Response(
            302, headers={"location": "https://attacker.example/steal"}
        )
    )
    with pytest.raises(AccessUnavailable):
        await verifier.verify("some-token")
    await verifier.aclose()


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"id": None},
        {"id": "not-a-uuid"},
        {"sub": OPERATOR_ID},
        [],
    ],
)
async def test_malformed_success_payload_is_unavailable(payload):
    verifier = build(
        lambda request: httpx.Response(200, json=payload)
    )
    with pytest.raises(AccessUnavailable):
        await verifier.verify("some-token")
    await verifier.aclose()


async def test_error_body_text_never_becomes_the_failure_reason():
    verifier = build(
        lambda request: httpx.Response(
            500, text="postgres://service-role:secret@internal"
        )
    )
    with pytest.raises(AccessUnavailable) as excinfo:
        await verifier.verify("some-token")
    assert "secret" not in str(excinfo.value)
    await verifier.aclose()


async def test_positive_authorization_is_never_cached():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"id": OPERATOR_ID})

    verifier = build(handler)
    await verifier.verify("token-one")
    await verifier.verify("token-one")
    assert len(calls) == 2
    await verifier.aclose()


async def test_empty_token_is_rejected_before_any_request():
    calls = []
    verifier = build(lambda request: calls.append(request) or httpx.Response(200))
    with pytest.raises(InvalidAccessToken):
        await verifier.verify("   ")
    assert calls == []
    await verifier.aclose()
