"""Operation-claims primitive contract (spec 04).

The ``operations`` primitive backs additive idempotency/order persistence:
request-keyed conditional claims with fence version guards. The same
behaviours must hold for every adapter that owns operation claims; they
are written once here and executed against every world in ``_WORLDS``.

The primitives shared with the later queue spec:
- exactly one claimant wins a request key while it is being processed;
- a claim arms the row with a fence version, and renewals increment it;
- a stale owner (an old fence snapshot) cannot publish over a live fence;
- a completed operation refuses further claims;
- admission order grows monotonically across distinct operations.

Contract functions must not import app code.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Awaitable, Callable

import pytest

REQUEST_KEY_A = "contract-op-alpha"
REQUEST_KEY_B = "contract-op-beta"
CLAIMANT_A = "worker-alpha"
CLAIMANT_B = "worker-beta"


class OperationsContractPort:
    """Port-shaped driver over the real SQL RPC functions.

    This is a stand-in for the queue spec's infrastructure adapter: the
    transport is the real Postgres functions reached through the supabase
    stub, so the contract exercises actual uniqueness, CAS and lock
    semantics.
    """

    def __init__(self, stub) -> None:
        self._stub = stub

    async def claim(self, request_key: str, claimant: str) -> dict | None:
        result = self._stub.rpc(
            "claim_operation",
            {"p_request_key": request_key, "p_claimant": claimant},
        ).execute()
        if result.data is None:
            return None
        assert isinstance(result.data, dict)
        return result.data

    async def publish(self, operation_id: str, expected_fence: int) -> bool:
        result = self._stub.rpc(
            "publish_operation",
            {"p_operation_id": operation_id, "p_expected_fence": expected_fence},
        ).execute()
        return bool(result.data)


class OperationsRpcWorld:
    """Contract world where the port is the real database."""

    def __init__(self, db) -> None:
        from tests.doubles.supabase_stub import stub_for

        self.db = db
        self.adapter = OperationsContractPort(stub_for(db))

    # -- observation --------------------------------------------------------

    def operations(self, request_key: str) -> list[dict]:
        """Rows persisted for one request key: idempotency means one."""
        return self.db.query(
            """
            SELECT id, request_key, claimant, status, fence_version, admission
            FROM operations
            WHERE request_key = %s
            """,
            (request_key,),
        )

    def operation_count(self) -> int:
        return self.db.query("SELECT COUNT(*) FROM operations")[0][0]

    def status(self, request_key: str) -> str | None:
        rows = self.operations(request_key)
        return rows[0][3] if rows else None

    # -- concurrency harness -------------------------------------------------

    def run_pair(
        self,
        first: Callable[[], Awaitable],
        second: Callable[[], Awaitable],
    ):
        """Run two port calls on independent sessions released together.

        Results keep the input order; the first failure is raised (which
        also releases a peer still waiting on the barrier).
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


def _real_rpc_world(disposable_db) -> OperationsRpcWorld:
    return OperationsRpcWorld(disposable_db)


_WORLDS: list[Callable[..., OperationsRpcWorld]] = [_real_rpc_world]


@pytest.fixture(params=_WORLDS, ids=lambda world_factory: world_factory.__name__)
def world(request, disposable_db):
    return request.param(disposable_db)


# ---------------------------------------------------------------------------
# Request-key idempotency returns the same operation, fences grow on renew
# ---------------------------------------------------------------------------


async def test_renewing_a_claim_keeps_the_operation_and_increments_the_fence(world):
    first = await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A)
    assert isinstance(first, dict)
    assert first["request_key"] == REQUEST_KEY_A
    assert first["claimant"] == CLAIMANT_A
    assert first["status"] == "processing"
    assert first["fence_version"] == 1

    renewed = await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A)
    assert isinstance(renewed, dict)
    assert renewed["id"] == first["id"]
    assert renewed["fence_version"] == 2

    persisted = world.operations(REQUEST_KEY_A)
    assert len(persisted) == 1, "the same request key must not spawn rows"
    assert world.operation_count() == 1


# ---------------------------------------------------------------------------
# Competing claimants: exactly one winner, one refusal
# ---------------------------------------------------------------------------


async def test_competing_claims_produce_one_winner_and_one_refusal(world):
    first_result, second_result = world.run_pair(
        lambda: world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A),
        lambda: world.adapter.claim(REQUEST_KEY_A, CLAIMANT_B),
    )
    outcomes = [first_result, second_result]
    winners = [row for row in outcomes if isinstance(row, dict)]
    refusals = [row for row in outcomes if row is None]

    assert len(winners) == 1
    assert len(refusals) == 1
    assert winners[0]["claimant"] in (CLAIMANT_A, CLAIMANT_B)
    assert world.operations(REQUEST_KEY_A)[0][2] == winners[0]["claimant"]
    assert world.operation_count() == 1


# ---------------------------------------------------------------------------
# Fence guards: a stale owner cannot publish, a live owner can
# ---------------------------------------------------------------------------


async def test_a_stale_owner_publish_is_rejected_and_the_live_fence_succeeds(world):
    claimed = await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A)
    renewed = await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A)
    assert renewed["fence_version"] == 2

    assert await world.adapter.publish(claimed["id"], claimed["fence_version"]) is False
    assert world.status(REQUEST_KEY_A) == "processing"

    assert await world.adapter.publish(renewed["id"], renewed["fence_version"]) is True
    assert world.status(REQUEST_KEY_A) == "done"


# ---------------------------------------------------------------------------
# Completed operations refuse further claims
# ---------------------------------------------------------------------------


async def test_a_completed_operation_refuses_further_claims(world):
    claimed = await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A)
    assert await world.adapter.publish(claimed["id"], claimed["fence_version"]) is True
    assert await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A) is None
    assert await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_B) is None


# ---------------------------------------------------------------------------
# Admission order persists across distinct operations
# ---------------------------------------------------------------------------


async def test_admission_order_grows_across_distinct_operations(world):
    first = await world.adapter.claim(REQUEST_KEY_A, CLAIMANT_A)
    second = await world.adapter.claim(REQUEST_KEY_B, CLAIMANT_B)
    assert second["admission"] > first["admission"]
    assert world.operation_count() == 2
