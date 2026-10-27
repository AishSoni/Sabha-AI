"""The server client must connect with a role that owns post-003 write access."""

from __future__ import annotations

import pytest

import app.platform.database as database


class _Recorder:
    calls: list[tuple[str, str]] = []

    @classmethod
    def create(cls, url: str, key: str) -> object:
        cls.calls.append((url, key))
        return object()


@pytest.fixture(autouse=True)
def isolated_client(monkeypatch: pytest.MonkeyPatch) -> None:
    _Recorder.calls = []
    monkeypatch.setattr(database, "_supabase_client", None)
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

    assert _Recorder.calls == [("http://127.0.0.1:54321", "service-key")]


def test_server_client_falls_back_to_the_anon_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(database.settings, "supabase_service_key", "", raising=False)

    database.get_supabase()

    assert _Recorder.calls == [("http://127.0.0.1:54321", "anon-key")]


def test_server_client_is_created_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        database.settings, "supabase_service_key", "service-key", raising=False
    )

    first = database.get_supabase()
    second = database.get_supabase()

    assert first is second
    assert len(_Recorder.calls) == 1
