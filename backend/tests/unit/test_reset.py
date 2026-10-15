"""P01-TEST03: fixtures reset shared state; second test starts clean."""

import time

import pytest

from tests.doubles.clock import FakeClock, PatchedTime

pytestmark = pytest.mark.anyio


@pytest.fixture
def mutable_shelf():
    return {"messages": []}


async def test_first_mutation_does_not_leak(mutable_shelf):
    mutable_shelf["messages"].append("turn-1")
    assert len(mutable_shelf["messages"]) == 1


async def test_second_starts_clean(mutable_shelf):
    assert mutable_shelf["messages"] == []


async def test_singletons_do_not_leak_between_tests():
    from app.core import database as db_module
    from app.core import qdrant as qdrant_module

    assert db_module._supabase_client is None
    assert qdrant_module._client is None


def test_fake_timers_restored_even_after_failure():
    real_monotonic, real_time = time.monotonic, time.time
    clock = FakeClock()
    try:
        with PatchedTime(clock):
            assert time.monotonic() == clock.now()
            clock.advance(30)
            raise ValueError("simulated test failure")
    except ValueError:
        pass
    assert time.monotonic is real_monotonic
    assert time.time is real_time
