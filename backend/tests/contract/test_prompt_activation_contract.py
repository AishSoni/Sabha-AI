"""Shared prompt-activation contract (spec 04).

The same behaviours must hold for every adapter that owns prompt
selection: the in-memory fake used by use-case tests and the real
Supabase-RPC adapter composition wires. The behaviours are written once
in this module and executed against every world in ``_WORLDS``; an
adapter that breaks the contract here does not get composed.

A *world* bundles the port-shaped adapter under test with observations
of the persisted state and a failure injector: a fake's failure switch
and a real constraint violation are different means to the same contract
end. Today only the real-database world is attached; the fake port
arrives with ``app.modules.persona_catalog`` and joins ``_WORLDS`` then.
Contract functions must not import app code.
"""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Awaitable, Callable

import pytest

PERSONA_ID = "77777777-7777-4777-7777-777777777777"
UNKNOWN_PERSONA_ID = "77777777-7777-4777-7777-777777777771"
V1_ID = "77777777-7777-4777-7777-777777777781"
V2_ID = "77777777-7777-4777-7777-777777777782"
RACED_VERSION_ID = "77777777-7777-4777-7777-777777777789"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RpcPromptPort:
    """Port-shaped driver over the real SQL RPC functions.

    This is a stand-in for the owning module's infrastructure adapter
    (``app.modules.persona_catalog.infrastructure``): the transport is the
    real Postgres functions reached through the supabase stub, so the
    contract exercises actual locking, uniqueness and rollback semantics.
    """

    def __init__(self, stub) -> None:
        self._stub = stub

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        result = self._stub.rpc(
            "activate_prompt_version",
            {"p_persona_id": persona_id, "p_version": version},
        ).execute()
        return bool(result.data)

    async def create_prompt_version(
        self,
        persona_id: str,
        content: str,
        *,
        version_id: str,
        created_at: str,
    ) -> dict:
        result = self._stub.rpc(
            "create_prompt_version",
            {
                "p_persona_id": persona_id,
                "p_content": content,
                "p_version_id": version_id,
                "p_created_at": created_at,
            },
        ).execute()
        assert isinstance(result.data, dict)
        return result.data


class RealRpcWorld:
    """Contract world where the port is the real database."""

    def __init__(self, db) -> None:
        from tests.doubles.supabase_stub import stub_for

        self.db = db
        self.adapter = RpcPromptPort(stub_for(db))
        self._fail_next_create = False
        self._seed()

    def _seed(self) -> None:
        now = _now()
        with self.db.connect() as conn:
            conn.execute(
                """
                INSERT INTO personas (id, name, subtitle, color, is_default)
                VALUES (%s, 'Contract Advisor', 'Prompt Governance Lead', '#0ea5e9', TRUE)
                """,
                (PERSONA_ID,),
            )
            conn.execute(
                """
                INSERT INTO prompt_versions
                    (id, persona_id, version, content, is_active, created_at)
                VALUES
                    (%s, %s, 1, 'contract v1', TRUE, %s),
                    (%s, %s, 2, 'contract v2', FALSE, %s)
                """,
                (V1_ID, PERSONA_ID, now, V2_ID, PERSONA_ID, now),
            )

    # -- observation --------------------------------------------------------

    def active_version(self, persona_id: str = PERSONA_ID):
        rows = self.db.query(
            "SELECT version FROM prompt_versions WHERE is_active AND persona_id = %s",
            (persona_id,),
        )
        assert len(rows) <= 1, "at-most-one-active invariant violated"
        return rows[0][0] if rows else None

    def version_count(self, persona_id: str = PERSONA_ID) -> int:
        return self.db.query(
            "SELECT COUNT(*) FROM prompt_versions WHERE persona_id = %s",
            (persona_id,),
        )[0][0]

    # -- failure and concurrency harness ------------------------------------

    def fail_next_create(self) -> None:
        self._fail_next_create = True

    async def activate(self, version: int, persona_id: str = PERSONA_ID) -> bool:
        return await self.adapter.activate_prompt_version(persona_id, version)

    async def create(self, content: str, persona_id: str = PERSONA_ID) -> dict:
        payload = content
        if self._fail_next_create:
            self._fail_next_create = False
            # content NOT NULL trips the failure inside the atomic function
            payload = None
        return await self.adapter.create_prompt_version(
            persona_id, payload, version_id=RACED_VERSION_ID, created_at=_now()
        )

    def run_pair(
        self,
        first: Callable[[], Awaitable],
        second: Callable[[], Awaitable],
    ):
        """Run two port calls on independent sessions released together.

        Both calls go through real database connections, so the lock
        protocol decides the interleaving; the contract only observes the
        outcome. Results keep the input order; the first failure is
        raised (which also releases a peer still waiting on the barrier).
        """
        barrier = threading.Barrier(2, timeout=10)
        results: list = [None, None]
        errors: list = [None, None]

        def worker(index: int, call: Callable[[], Awaitable]) -> None:
            try:
                barrier.wait()
                results[index] = asyncio.run(call())
            except BaseException as exc:  # failures are contract outcomes
                errors[index] = exc
                barrier.abort()

        calls = (first, second)
        threads = [
            threading.Thread(target=worker, args=(index, calls[index]))
            for index in range(2)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)
        for error in errors:
            if error is not None:
                raise error
        return results[0], results[1]


def _real_rpc_world(disposable_db) -> RealRpcWorld:
    return RealRpcWorld(disposable_db)


_WORLDS: list[Callable[..., RealRpcWorld]] = [_real_rpc_world]


@pytest.fixture(params=_WORLDS, ids=lambda world_factory: world_factory.__name__)
def world(request, disposable_db):
    return request.param(disposable_db)


# ---------------------------------------------------------------------------
# Selection refusal preserves the previous active version
# ---------------------------------------------------------------------------


async def test_activating_an_unknown_persona_preserves_the_previous_selection(world):
    assert await world.activate(1, persona_id=UNKNOWN_PERSONA_ID) is False
    assert world.active_version() == 1


async def test_activating_an_unknown_version_preserves_the_previous_selection(world):
    assert await world.activate(99) is False
    assert world.active_version() == 1


async def test_successful_activation_replaces_the_previous_selection(world):
    assert await world.activate(2) is True
    assert world.active_version() == 2


# ---------------------------------------------------------------------------
# Failure injection rolls the whole write back
# ---------------------------------------------------------------------------


async def test_a_failed_revision_creation_rolls_back_and_preserves_the_selection(world):
    world.fail_next_create()
    with pytest.raises(Exception):
        await world.create("poisoned revision")
    assert world.active_version() == 1
    assert world.version_count() == 2


async def test_creating_a_revision_for_an_unknown_persona_persists_nothing(world):
    with pytest.raises(Exception):
        await world.create("orphan revision", persona_id=UNKNOWN_PERSONA_ID)
    assert world.version_count() == 2
    assert world.active_version() == 1


async def test_successful_revision_creation_appends_and_activates(world):
    created = await world.create("becomes the directive")
    assert created["version"] == 3
    assert created["is_active"] is True
    assert world.active_version() == 3
    assert world.version_count() == 3


# ---------------------------------------------------------------------------
# Concurrent writers serialize and retain at most one active version
# ---------------------------------------------------------------------------


async def test_concurrent_activations_retain_at_most_one_active_version(world):
    activated_first, activated_second = world.run_pair(
        lambda: world.adapter.activate_prompt_version(PERSONA_ID, 1),
        lambda: world.adapter.activate_prompt_version(PERSONA_ID, 2),
    )
    assert activated_first is True
    assert activated_second is True
    assert world.active_version() in (1, 2)


async def test_concurrent_creation_and_activation_leave_exactly_one_active(world):
    created_now = _now()
    activated, created = world.run_pair(
        lambda: world.adapter.activate_prompt_version(PERSONA_ID, 2),
        lambda: world.adapter.create_prompt_version(
            PERSONA_ID,
            "raced revision",
            version_id=RACED_VERSION_ID,
            created_at=created_now,
        ),
    )
    assert activated is True
    assert created["version"] == 3
    assert world.active_version() in (2, 3)
    assert world.version_count() == 3
