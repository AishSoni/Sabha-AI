"""Integration: a warm replay request performs no database work (spec 20).

The published package version is immutable, so once its rows are loaded the
process can serve every later request from memory. Only registry selection and
retirement status carry a TTL, because deployment state may change while a
pinned version must not.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import psycopg
import pytest

import app.platform.replay_database as replay_database
from app.platform.config import settings
from app.replay.cache import ReplayCache
from app.replay.reads import ReplayReads
from app.replay.source import ReplaySource
from scripts.replay_package import activate_package, retire_package
from tests.support.replay import (
    PUBLISHER_LOGIN,
    READER_LOGIN,
    login_uri,
    provision_logins,
    publish_dir,
)

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "replay"
PACKAGE_ID = "fixture-minimal"
CHECKPOINT_ID = "checkpoint-initial"


class _Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class _Connector:
    """Count connection borrows instead of hiding them inside the source."""

    def __init__(self) -> None:
        self.borrows = 0

    def __call__(self):
        self.borrows += 1
        return replay_database.connect_replay_reader()


@pytest.fixture()
def replay_db(disposable_db, monkeypatch: pytest.MonkeyPatch):
    provision_logins(disposable_db)
    publish_dir(disposable_db, FIXTURES / "fixture-minimal")
    publish_dir(disposable_db, FIXTURES / "fixture-minimal-v2")
    monkeypatch.setattr(
        settings,
        "replay_database_url",
        login_uri(disposable_db, READER_LOGIN),
        raising=False,
    )
    monkeypatch.setattr(settings, "replay_pool_min_size", 2, raising=False)
    monkeypatch.setattr(settings, "replay_pool_max_size", 4, raising=False)
    monkeypatch.setattr(settings, "replay_pool_timeout_seconds", 5.0, raising=False)
    monkeypatch.setattr(settings, "replay_pool_reconnect_seconds", 0.5, raising=False)
    try:
        yield disposable_db
    finally:
        replay_database.close_replay_pool()


def _source(cache: ReplayCache | None = None) -> tuple[ReplaySource, _Connector]:
    connector = _Connector()
    return ReplaySource(connect=connector, cache=cache), connector


def _activate(db, version: str) -> None:
    with psycopg.connect(login_uri(db, PUBLISHER_LOGIN)) as conn:
        activate_package(conn, PACKAGE_ID, version)


async def test_cold_resolution_borrows_once_and_warm_reads_stay_in_memory(
    replay_db,
) -> None:
    cache = ReplayCache()
    source, connector = _source(cache)

    first = await source.resolve_package(PACKAGE_ID, "1")
    assert connector.borrows == 1
    assert first.version == "1"

    second = await source.resolve_package(PACKAGE_ID, "1")
    assert second == first
    assert connector.borrows == 1
    assert cache.stats()["loads"] == 1


async def test_active_resolution_uses_one_registry_read_and_one_package_read(
    replay_db,
) -> None:
    _activate(replay_db, "1")
    cache = ReplayCache()
    source, connector = _source(cache)

    published = await source.resolve_package(PACKAGE_ID, None)
    assert published.version == "1"
    assert connector.borrows == 2

    await source.resolve_package(PACKAGE_ID, None)
    assert connector.borrows == 2


async def test_six_parallel_checkpoint_reads_share_one_connection(replay_db) -> None:
    cache = ReplayCache()
    source, connector = _source(cache)

    checkpoints = await asyncio.gather(
        *(
            source.read_checkpoint(PACKAGE_ID, "1", CHECKPOINT_ID)
            for _ in range(6)
        )
    )
    assert {checkpoint.checkpoint_id for checkpoint in checkpoints} == {CHECKPOINT_ID}
    assert connector.borrows == 1
    assert cache.stats()["loads"] == 1
    assert cache.stats()["coalesced"] == 5

    await source.read_checkpoint(PACKAGE_ID, "1", CHECKPOINT_ID)
    assert connector.borrows == 1


async def test_one_container_reads_its_checkpoint_once(replay_db) -> None:
    _activate(replay_db, "1")
    source, connector = _source(ReplayCache())
    published = await source.resolve_package(PACKAGE_ID, "1")
    reads = ReplayReads(source, published, CHECKPOINT_ID)

    assert await reads.get_meeting(published.meeting_id) is not None
    await reads.list_meetings()
    await reads.context_stats(published.meeting_id)
    assert connector.borrows == 2  # one package resolution, one checkpoint read

    await reads.get_meeting(published.meeting_id)
    assert connector.borrows == 2


async def test_registry_selection_expires_but_package_content_does_not(
    replay_db,
) -> None:
    _activate(replay_db, "1")
    clock = _Clock()
    cache = ReplayCache(
        clock=clock,
        registry_ttl_seconds=30.0,
        # Keep status fresh throughout so this test only observes the registry.
        status_ttl_seconds=3600.0,
    )
    source, connector = _source(cache)

    assert (await source.resolve_package(PACKAGE_ID, None)).version == "1"
    assert connector.borrows == 2

    _activate(replay_db, "2")
    assert (await source.resolve_package(PACKAGE_ID, None)).version == "1"
    assert connector.borrows == 2

    clock.advance(30.1)
    assert (await source.resolve_package(PACKAGE_ID, None)).version == "2"
    assert connector.borrows == 4

    # The pinned v1 content is still in memory even though the registry moved.
    assert (await source.resolve_package(PACKAGE_ID, "1")).version == "1"
    assert connector.borrows == 4


async def test_retirement_status_is_observed_after_the_documented_ttl(
    replay_db,
) -> None:
    _activate(replay_db, "1")
    clock = _Clock()
    cache = ReplayCache(clock=clock, status_ttl_seconds=30.0)
    source, _connector = _source(cache)

    pinned = await source.resolve_package(PACKAGE_ID, "1")
    assert pinned.status == "published"

    _activate(replay_db, "2")
    with psycopg.connect(login_uri(replay_db, PUBLISHER_LOGIN)) as conn:
        retire_package(conn, PACKAGE_ID, "1")

    assert (await source.resolve_package(PACKAGE_ID, "1")).status == "published"
    clock.advance(30.1)
    assert (await source.resolve_package(PACKAGE_ID, "1")).status == "retired"
