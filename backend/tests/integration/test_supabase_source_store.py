"""Contract tests for the selected Supabase Storage source store.

The real ``storage3`` client executes against an in-memory HTTP double. The
same contract can later run against a local Supabase stack by swapping the
transport (see HOSTED_STORAGE_VERIFICATION.md); no production code changes.
"""

from __future__ import annotations

import io

import httpx
import pytest
from storage3 import SyncStorageClient

from app.modules.knowledge.application.ports import (
    SourceNotFound,
    SourceObjectTooLarge,
    SourceStoreUnavailable,
)
from app.modules.knowledge.infrastructure.source_store import SupabaseSourceStore
from tests.doubles.storage_api import FakeStorageApi

pytestmark = pytest.mark.integration


def _store(fake: FakeStorageApi, *, bucket: str = "sabha-sources") -> SupabaseSourceStore:
    client = httpx.Client(transport=fake.transport())

    def factory() -> SyncStorageClient:
        return SyncStorageClient(
            url="http://storage.local/storage/v1",
            headers={
                "apikey": "service-key",
                "Authorization": "Bearer service-key",
            },
            http_client=client,
        )

    return SupabaseSourceStore(
        url="http://storage.local",
        service_key="service-key",
        bucket=bucket,
        client_factory=factory,
    )


def test_ensure_ready_creates_a_private_bucket_once():
    fake = FakeStorageApi()
    store = _store(fake)

    store.ensure_ready()
    store.ensure_ready()

    assert fake.buckets == {"sabha-sources": {}}
    assert ("POST", "/storage/v1/bucket") in fake.requests


def test_put_move_download_delete_roundtrip():
    fake = FakeStorageApi("sabha-sources")
    store = _store(fake)
    payload = b"pricing evidence sentinel"

    store.put(
        "staging/doc-1/rev-1",
        io.BytesIO(payload),
        content_type="text/plain",
        max_bytes=1024,
    )
    assert fake.buckets["sabha-sources"]["staging/doc-1/rev-1"] == payload

    store.move("staging/doc-1/rev-1", "sources/stack/s1/doc-1/rev-1/notes.txt")

    assert not fake.buckets["sabha-sources"].get("staging/doc-1/rev-1")
    assert store.exists("sources/stack/s1/doc-1/rev-1/notes.txt") is True
    assert store.download(
        "sources/stack/s1/doc-1/rev-1/notes.txt", max_bytes=1024
    ) == payload

    store.delete("sources/stack/s1/doc-1/rev-1/notes.txt")
    store.delete("sources/stack/s1/doc-1/rev-1/notes.txt")

    assert fake.keys("sabha-sources") == []


def test_repeated_move_of_an_already_finalized_object_is_a_noop():
    fake = FakeStorageApi("sabha-sources")
    fake.seed("sabha-sources", "sources/doc/rev/file.txt", b"kept")
    store = _store(fake)

    store.move("staging/doc/rev", "sources/doc/rev/file.txt")

    assert fake.buckets["sabha-sources"]["sources/doc/rev/file.txt"] == b"kept"


def test_put_rejects_streams_over_the_write_budget():
    fake = FakeStorageApi("sabha-sources")
    store = _store(fake)

    with pytest.raises(SourceObjectTooLarge):
        store.put(
            "staging/doc-1/rev-1",
            io.BytesIO(b"x" * 64),
            content_type="text/plain",
            max_bytes=32,
        )

    assert fake.keys("sabha-sources") == []


def test_missing_source_raises_typed_errors():
    store = _store(FakeStorageApi("sabha-sources"))

    with pytest.raises(SourceNotFound):
        store.download("sources/missing", max_bytes=1024)
    with pytest.raises(SourceNotFound):
        store.move("staging/missing", "sources/missing")
    assert store.exists("sources/missing") is False


def test_download_rejects_objects_over_the_read_budget():
    fake = FakeStorageApi("sabha-sources")
    fake.seed("sabha-sources", "sources/big", b"x" * 64)
    store = _store(fake)

    with pytest.raises(SourceObjectTooLarge):
        store.download("sources/big", max_bytes=32)


def test_list_prefix_returns_immediate_children():
    fake = FakeStorageApi("sabha-sources")
    fake.seed("sabha-sources", "staging/doc-1/rev-1", b"a")
    fake.seed("sabha-sources", "staging/doc-1/rev-2", b"bb")
    fake.seed("sabha-sources", "staging/doc-2/rev-1", b"ccc")
    fake.seed("sabha-sources", "sources/other", b"dddd")
    store = _store(fake)

    listed = store.list_prefix("staging/doc-1")

    assert [item.key for item in listed] == [
        "staging/doc-1/rev-1",
        "staging/doc-1/rev-2",
    ]
    assert [item.size for item in listed] == [1, 2]


def test_storage_failure_becomes_an_unavailable_error():
    fake = FakeStorageApi()
    fake.fail("GET", "/storage/v1/bucket/sabha-sources", 500)
    store = _store(fake)

    with pytest.raises(SourceStoreUnavailable):
        store.ensure_ready()


def test_unconfigured_store_fails_closed():
    store = SupabaseSourceStore(url="", service_key="", bucket="sabha-sources")

    with pytest.raises(SourceStoreUnavailable):
        store.ensure_ready()
