"""The server client must use the service credential, never the anon key."""

from __future__ import annotations

import httpx
import pytest

import app.platform.database as database
from app.platform.http_client import RetryingClient, build_client


class _Recorder:
    calls: list[tuple[str, str, object]] = []

    @classmethod
    def create(cls, url: str, key: str, options: object = None) -> object:
        cls.calls.append((url, key, options))
        return object()


@pytest.fixture(autouse=True)
def isolated_client(monkeypatch: pytest.MonkeyPatch) -> None:
    _Recorder.calls = []
    monkeypatch.setattr(database, "_supabase_client", None)
    monkeypatch.setattr(database, "_http_client", None)
    monkeypatch.setattr(database, "create_client", _Recorder.create)
    monkeypatch.setattr(
        database.settings, "supabase_url", "http://127.0.0.1:54321", raising=False
    )
    monkeypatch.setattr(database.settings, "supabase_key", "anon-key", raising=False)


def test_server_client_prefers_the_service_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        database.settings, "supabase_service_key", "service-key", raising=False
    )

    database.get_supabase()

    assert [(url, key) for url, key, _ in _Recorder.calls] == [
        ("http://127.0.0.1:54321", "service-key")
    ]


def test_missing_service_key_fails_clearly_without_anon_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(database.settings, "supabase_service_key", "", raising=False)

    with pytest.raises(database.DatabaseConfigurationError, match="SUPABASE_SERVICE_KEY"):
        database.get_supabase()

    assert _Recorder.calls == []


def test_server_client_is_created_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        database.settings, "supabase_service_key", "service-key", raising=False
    )

    first = database.get_supabase()
    second = database.get_supabase()

    assert first is second
    assert len(_Recorder.calls) == 1


def test_server_client_shares_one_retrying_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every sub-client reuses the pool, so a stale connection is retried once."""
    monkeypatch.setattr(
        database.settings, "supabase_service_key", "service-key", raising=False
    )

    database.get_supabase()
    database.get_supabase_admin()

    pools = [options.httpx_client for _, _, options in _Recorder.calls]
    assert pools[0] is pools[1]
    assert isinstance(pools[0], RetryingClient)


def test_closing_the_pool_is_idempotent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        database.settings, "supabase_service_key", "service-key", raising=False
    )
    database.get_supabase()

    database.close_supabase()
    database.close_supabase()

    assert database._http_client is None


# ---------------------------------------------------------------------------
# Transport resilience
# ---------------------------------------------------------------------------


def test_dead_pooled_connection_is_replayed_on_a_fresh_one() -> None:
    """The reported '$ssl.c:2427' EOF is a write error before any response."""
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        if len(attempts) == 1:
            raise httpx.WriteError(
                "EOF occurred in violation of protocol (_ssl.c:2427)", request=request
            )
        return httpx.Response(200, json={"outcome": "claimed"})

    client = RetryingClient(
        transport=httpx.MockTransport(handler), max_attempts=2, backoff_seconds=0
    )

    response = client.post("https://example.supabase.co/rest/v1/rpc/claim")

    assert response.status_code == 200
    assert len(attempts) == 2


def test_retries_are_bounded() -> None:
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        raise httpx.ConnectError("connection refused", request=request)

    client = RetryingClient(
        transport=httpx.MockTransport(handler), max_attempts=3, backoff_seconds=0
    )

    with pytest.raises(httpx.ConnectError):
        client.get("https://example.supabase.co/rest/v1/meetings")

    assert len(attempts) == 3


def test_read_failures_are_not_replayed() -> None:
    """A read failure may mean the write already committed; never replay it."""
    attempts: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        raise httpx.ReadError("connection reset mid-response", request=request)

    client = RetryingClient(
        transport=httpx.MockTransport(handler), max_attempts=3, backoff_seconds=0
    )

    with pytest.raises(httpx.ReadError):
        client.post("https://example.supabase.co/rest/v1/rpc/publish")

    assert len(attempts) == 1


def test_build_client_applies_the_configured_policy() -> None:
    client = build_client(
        timeout_seconds=12.5,
        max_connections=4,
        keepalive_seconds=15.0,
        retries=2,
    )
    try:
        assert isinstance(client, RetryingClient)
        assert client.timeout == httpx.Timeout(12.5)
        assert client._max_attempts == 3  # retries + initial attempt
    finally:
        client.close()
