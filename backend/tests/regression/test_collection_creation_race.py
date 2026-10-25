"""Regression (spec-02, collection_creation_barrier): collection creation and
vector configuration are validated against racing indexers.

Today (spec-02 finding): `VectorStoreManager.create_collection` only treats a
known-existing collection as benign. When two indexers both see the collection
missing, the loser's `client.create_collection` raises Qdrant's
"already exists" error and the whole indexing fails. Existing collections are
also trusted blindly: a collection built for a different embedding dimension
(black-box provider swap, manual creation) rejects every upsert with an
obscure server error.

Contract captured here:
- a compatible existing collection stays benign (no second create);
- the race loser re-reads the collection and succeeds once validation passes;
- incompatible vector configs produce a controlled diagnostic, not an obscure
  server error at upsert time;
- a create failure while the collection is still missing is a controlled
  failure propagated to the indexer (status 'failed', no silent swallow).
"""

import asyncio
from types import SimpleNamespace
from typing import List

import pytest

from app.modules.knowledge.infrastructure.parsers import DocumentChunk
from app.modules.knowledge.infrastructure import legacy_vector_store as vector_store_module
from app.modules.knowledge.infrastructure.legacy_vector_store import VectorStoreManager
from qdrant_client.models import Distance, VectorParams

COLLECTION = "meeting_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01_shared"


class ScriptedQdrant:
    """In-memory Qdrant double with race/failure scripting for lifecycle calls."""

    def __init__(self):
        self._vectors: dict[str, VectorParams] = {}
        self.create_calls: list[str] = []
        self.create_conflicts = 0  # "already exists" responses surfaced to callers
        self.upserts: list[tuple[str, int]] = []
        self.park_listings = 0  # number of listings to park until released
        self._parked: list[asyncio.Event] = []
        # script the next create call to raise while the collection stays absent
        self.fail_next_create_with: Exception | None = None

    # --- listings -----------------------------------------------------------
    async def get_collections(self):
        # Snapshot BEFORE parking: a mid-race call must observe the state as
        # it was when the check was issued (both parked callers saw missing).
        names = list(self._vectors)
        if self.park_listings > 0:
            self.park_listings -= 1
            event = asyncio.Event()
            self._parked.append(event)
            await event.wait()
        return SimpleNamespace(
            collections=[
                SimpleNamespace(name=name) for name in names
            ]
        )

    async def get_collection(self, collection_name: str):
        if collection_name not in self._vectors:
            raise ValueError(f"Collection {collection_name!r} not found")
        return SimpleNamespace(
            config=SimpleNamespace(params=SimpleNamespace(vectors=self._vectors[collection_name]))
        )

    # --- lifecycle ----------------------------------------------------------
    async def create_collection(self, collection_name: str, vectors_config: VectorParams = None):
        if self.fail_next_create_with is not None:
            failure = self.fail_next_create_with
            self.fail_next_create_with = None
            raise failure
        if collection_name in self._vectors:
            self.create_conflicts += 1
            raise RuntimeError(f"Collection {collection_name!r} already exists!")
        self._vectors[collection_name] = vectors_config
        self.create_calls.append(collection_name)

    async def delete_collection(self, collection_name: str) -> bool:
        return self._vectors.pop(collection_name, None) is not None

    async def upsert(self, collection_name: str, points):
        self.upserts.append((collection_name, len(points)))

    # --- test helpers ---------------------------------------------------------
    def seed(self, collection_name: str, *, size: int, distance: Distance) -> None:
        self._vectors[collection_name] = VectorParams(size=size, distance=distance)

    def release_listings(self) -> None:
        for event in self._parked:
            event.set()
        self._parked.clear()


class FlatEmbedding:
    """Deterministic embedding provider with a configurable dimension."""

    def __init__(self, dimensions: int = 4):
        self._dimensions = dimensions

    @property
    def dimension(self) -> int:
        return self._dimensions

    async def embed_text(self, text: str) -> List[float]:
        return [1.0] * self._dimensions

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        return [[1.0] * self._dimensions for _ in texts]


def build_manager(fake: ScriptedQdrant, dimensions: int = 4) -> VectorStoreManager:
    manager = VectorStoreManager(embedding_provider=FlatEmbedding(dimensions))
    original_get_client = vector_store_module.get_qdrant_client

    def fake_client():
        return fake

    vector_store_module.get_qdrant_client = fake_client
    return manager, original_get_client


@pytest.fixture()
def race_env(monkeypatch):
    """VectorStoreManager over the scripted client (no real Qdrant)."""
    fake = ScriptedQdrant()
    manager = VectorStoreManager(embedding_provider=FlatEmbedding(dimensions=4))
    monkeypatch.setattr(vector_store_module, "get_qdrant_client", lambda: fake)
    return SimpleNamespace(fake=fake, manager=manager)


def one_chunk() -> List[DocumentChunk]:
    return [DocumentChunk(text="chunk one", chunk_index=0, metadata={})]


async def wait_until(predicate, *, timeout: float = 2.0) -> None:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Condition never became true")


async def test_compatible_existing_collection_is_benign(race_env):
    env = race_env
    env.fake.seed(COLLECTION, size=4, distance=Distance.COSINE)

    created = await env.manager.create_collection(COLLECTION)

    assert created is False
    assert env.fake.create_calls == [], "a compatible collection must not be recreated"
    assert env.fake.create_conflicts == 0


async def test_incompatible_dimension_is_a_controlled_failure(race_env):
    env = race_env
    env.fake.seed(COLLECTION, size=8, distance=Distance.COSINE)

    with pytest.raises(ValueError) as error:
        await env.manager.create_collection(COLLECTION)

    message = str(error.value)
    assert COLLECTION in message
    assert "8" in message and "4" in message, "both dimensions belong in the diagnostic"
    assert env.fake.upserts == [], "nothing may be upserted into an incompatible collection"


async def test_incompatible_distance_is_a_controlled_failure(race_env):
    env = race_env
    env.fake.seed(COLLECTION, size=4, distance=Distance.EUCLID)

    with pytest.raises(ValueError) as error:
        await env.manager.create_collection(COLLECTION)

    assert COLLECTION in str(error.value)
    assert env.fake.upserts == []


async def test_creation_race_loser_revalidates_and_shares_collection(race_env):
    env = race_env
    # Both indexers observe the collection missing before either creates.
    env.fake.park_listings = 2

    tasks = [
        asyncio.create_task(
            env.manager.index_document(COLLECTION, f"doc-{n}", one_chunk())
        )
        for n in range(2)
    ]
    await wait_until(lambda: len(env.fake._parked) == 2)
    env.fake.release_listings()

    indexed = await asyncio.gather(*tasks)

    assert indexed == [1, 1], "both indexers must complete"
    assert env.fake.create_conflicts == 1, "exactly one create hit 'already exists'"
    assert env.fake.upserts == [(COLLECTION, 1), (COLLECTION, 1)]
    assert env.fake.create_calls == [COLLECTION], "the collection is created exactly once"


async def test_create_failure_while_still_missing_is_controlled(race_env):
    env = race_env
    env.fake.fail_next_create_with = ConnectionError("qdrant unreachable")

    with pytest.raises(ConnectionError):
        await env.manager.create_collection(COLLECTION)

    assert env.fake.upserts == []
