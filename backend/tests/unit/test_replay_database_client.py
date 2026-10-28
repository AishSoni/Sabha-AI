"""Unit: the replay adapter is separate from the live database credential."""

from __future__ import annotations

import psycopg
import pytest

import app.platform.replay_database as replay


def test_missing_reader_url_never_falls_back_to_live_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[object, ...]] = []
    monkeypatch.setattr(replay.settings, "replay_database_url", "", raising=False)
    monkeypatch.setattr(
        replay.settings, "database_url", "postgresql://postgres@live/db", raising=False
    )
    monkeypatch.setattr(
        replay.settings, "supabase_service_key", "service-key", raising=False
    )
    monkeypatch.setattr(
        replay.psycopg, "connect", lambda *args, **kwargs: calls.append(args)
    )

    with pytest.raises(replay.ReplayReaderNotConfigured, match="REPLAY_DATABASE_URL"):
        replay.connect_replay_reader()

    assert calls == []


def test_non_postgres_reader_url_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        replay.settings, "replay_database_url", "https://example.test/replay", raising=False
    )

    with pytest.raises(replay.ReplayReaderNotConfigured, match="PostgreSQL"):
        replay.get_replay_database_url()


def test_connection_failure_is_wrapped_without_leaking_the_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    url = "postgresql://reader:secret@example.test/replay"
    monkeypatch.setattr(replay.settings, "replay_database_url", url, raising=False)

    def fail(*_args, **_kwargs):
        raise psycopg.OperationalError("connection refused")

    monkeypatch.setattr(replay.psycopg, "connect", fail)

    with pytest.raises(replay.ReplayReaderConnectionError) as raised:
        replay.connect_replay_reader()

    assert "secret" not in str(raised.value)
