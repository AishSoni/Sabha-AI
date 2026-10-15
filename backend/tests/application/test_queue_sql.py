"""Queue SQL guarantees: dispatch/edit races, crash-safe dispatch, FIFO drain
with late arrivals joining the tail (P04 TEST04/TEST05 on real SQL)."""

import threading

import pytest

from app.modules.meetings.queue import QueueConflict, SqliteQueueStore


def test_dispatch_races_edit_exactly_one_outcome_wins():
    store = SqliteQueueStore()
    entry_id = store.submit("m", "u", "contended")["entry_id"]
    peer = store.peer()
    outcomes = {}

    def do_dispatch():
        try:
            outcomes["dispatch"] = peer.dispatch_next("m", "u")
        except Exception as exc:  # noqa: BLE001
            outcomes["dispatch"] = exc

    def do_edit():
        try:
            outcomes["edit"] = store.edit(entry_id, "u", "edited",
                                          expected_revision=1)
        except Exception as exc:  # noqa: BLE001
            outcomes["edit"] = exc

    threads = [threading.Thread(target=do_dispatch),
               threading.Thread(target=do_edit)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    dispatch = outcomes["dispatch"]
    edit = outcomes["edit"]
    if isinstance(dispatch, dict) and dispatch["content"] == "contended":
        # Dispatch won the race on the original content: the edit must lose.
        assert isinstance(edit, QueueConflict)
        assert store.entry_state(entry_id) == "dispatched"
    elif isinstance(edit, dict):
        # Edit committed (first or before dispatch claimed): delivery, if any,
        # must carry the edited content; stale content must never deliver.
        assert edit["revision"] == 2
        if isinstance(dispatch, dict):
            assert dispatch["content"] == "edited"
    else:
        # Dispatch claimed first but a racing edit changed the revision after
        # the claim read it: the claim loses and the entry stays pending.
        assert dispatch is None
        assert isinstance(edit, QueueConflict)
        assert store.entry_state(entry_id) == "pending"


def test_crash_between_dispatch_writes_retries_to_exactly_one_message():
    store = SqliteQueueStore()
    store.submit("m", "u", "fragile")
    with pytest.raises(RuntimeError, match="injected crash"):
        store.dispatch_next("m", "u", fail_after_insert=True)
    assert store.entry_state(store.pending("m")[0]["entry_id"]) == "pending"
    assert store.message_count("m") == 0
    result = store.dispatch_next("m", "u")
    assert result is not None
    assert store.dispatch_next("m", "u") is None
    assert store.message_count("m") == 1


def test_drain_fifo_and_late_arrivals_never_overtake():
    store = SqliteQueueStore()
    for content in ("A", "B", "C"):
        store.submit("m", "u", content)
    first = store.dispatch_next("m", "u")
    assert first["content"] == "A"
    store.submit("m", "u", "late")
    order = [first["content"]]
    while (nxt := store.dispatch_next("m", "u")) is not None:
        order.append(nxt["content"])
    assert order == ["A", "B", "C", "late"]
    assert store.pending("m") == []
