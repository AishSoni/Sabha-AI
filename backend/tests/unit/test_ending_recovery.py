"""Stage A (A5): stale ending-attempt recovery in begin_ending_attempt.

A crashed worker can leave an attempt row in_progress forever; without a
live ending lease the row must be committed failed so the next end request
can proceed. A live lease still means a concurrent ending (conflict)."""

from datetime import datetime, timedelta, timezone

import pytest

from app.modules.meetings.ending import EndingConflict
from app.services import MeetingManager

pytestmark = pytest.mark.anyio

ROSTER = [{"id": "p1", "name": "Alice"}]


def _future() -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()


def _past() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()


def _stale_attempt() -> dict:
    return {"attempt_id": "end-stale", "meeting_id": "m1",
            "idempotency_key": "old-key", "force_end": True,
            "roster_json": ROSTER, "outcome": "in_progress",
            "summary": None, "usage_json": {}}


class _Resp:
    def __init__(self, data):
        self.data = data


class _Select:
    def __init__(self, rows_fn):
        self._rows_fn = rows_fn
        self._filters = {}

    def select(self, cols="*"):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def execute(self):
        return _Resp(self._rows_fn(dict(self._filters)))


class _Table:
    def __init__(self, rows_fn, on_insert=None, on_update=None):
        self._rows_fn = rows_fn
        self._on_insert = on_insert
        self._on_update = on_update

    def select(self, cols="*"):
        return _Select(self._rows_fn)

    def insert(self, payload):
        table = self

        class _Insert:
            def execute(self):
                if table._on_insert is None:
                    raise AssertionError("insert not expected")
                table._on_insert(payload)
                return _Resp([payload])

        return _Insert()

    def update(self, payload):
        table = self

        class _Update:
            def __init__(self):
                self._filters = {}

            def eq(self, col, val):
                self._filters[col] = val
                return self

            def execute(self):
                if table._on_update is None:
                    raise AssertionError("update not expected")
                table._on_update(payload, dict(self._filters))
                return _Resp([])

        return _Update()


class _FakeSupabase:
    """Minimal PostgREST-shaped client covering begin_ending_attempt."""

    def __init__(self, endings, leases, fail_rpc=False):
        self.endings = endings
        self.leases = leases
        self.fail_rpc = fail_rpc
        self.rpc_calls = []
        self.inserts = []

    def table(self, name):
        if name == "ending_attempts":
            return _Table(
                rows_fn=self._select_endings,
                on_insert=self.inserts.append,
                on_update=self._update_ending,
            )
        if name == "execution_leases":
            return _Table(rows_fn=lambda filters: [
                row for row in self.leases
                if all(row.get(k) == v for k, v in filters.items())])
        raise AssertionError(f"unexpected table {name}")

    def _select_endings(self, filters):
        return [row for row in self.endings
                if all(row.get(k) == v for k, v in filters.items())]

    def _update_ending(self, payload, filters):
        for row in self.endings:
            if all(row.get(k) == v for k, v in filters.items()):
                row.update(payload)

    def rpc(self, name, params):
        self.rpc_calls.append((name, dict(params)))

        class _Rpc:
            def execute(self):
                if self.fail_rpc:
                    raise RuntimeError("function not found")
                # Mirrors the SQL guard: only in_progress rows update.
                for row in self.endings:
                    if (row["attempt_id"] == params["p_attempt_id"]
                            and row["outcome"] == "in_progress"):
                        row.update({"outcome": params["p_outcome"],
                                    "summary": params.get("p_summary")})
                return _Resp([])

        return _Rpc()


class _RecoveryManager(MeetingManager):
    def __init__(self, db):
        self.db = db  # deliberately no super().__init__: no live Supabase


async def test_stale_attempt_without_lease_recovers_and_inserts():
    db = _FakeSupabase(endings=[_stale_attempt()], leases=[])
    manager = _RecoveryManager(db)

    attempt = await manager.begin_ending_attempt(
        "m1", ROSTER, False, "new-key")

    assert attempt["duplicate"] is False
    assert attempt["attempt_id"] != "end-stale"
    assert len(db.rpc_calls) == 1
    name, params = db.rpc_calls[0]
    assert name == "commit_ending_attempt"
    assert params["p_attempt_id"] == "end-stale"
    assert params["p_outcome"] == "failed"
    assert len(db.inserts) == 1
    assert db.inserts[0]["idempotency_key"] == "new-key"


async def test_live_lease_blocks_recovery():
    db = _FakeSupabase(
        endings=[_stale_attempt()],
        leases=[{"meeting_id": "m1", "kind": "ending", "state": "claimed",
                 "lease_expires_at": _future()}],
    )
    manager = _RecoveryManager(db)

    with pytest.raises(EndingConflict, match="ending_in_progress"):
        await manager.begin_ending_attempt("m1", ROSTER, False, "new-key")

    assert db.rpc_calls == []
    assert db.inserts == []


async def test_expired_lease_allows_recovery():
    db = _FakeSupabase(
        endings=[_stale_attempt()],
        leases=[{"meeting_id": "m1", "kind": "ending", "state": "claimed",
                 "lease_expires_at": _past()}],
    )
    manager = _RecoveryManager(db)

    attempt = await manager.begin_ending_attempt(
        "m1", ROSTER, False, "new-key")

    assert attempt["duplicate"] is False
    assert len(db.rpc_calls) == 1
    assert len(db.inserts) == 1


async def test_non_ending_lease_rows_are_ignored():
    db = _FakeSupabase(
        endings=[_stale_attempt()],
        leases=[{"meeting_id": "m1", "kind": "turn", "state": "claimed",
                 "lease_expires_at": _future()}],
    )
    manager = _RecoveryManager(db)

    attempt = await manager.begin_ending_attempt(
        "m1", ROSTER, False, "new-key")

    assert attempt["duplicate"] is False
    assert len(db.rpc_calls) == 1


async def test_no_stale_attempt_inserts_directly_without_rpc():
    db = _FakeSupabase(endings=[], leases=[])
    manager = _RecoveryManager(db)

    attempt = await manager.begin_ending_attempt(
        "m1", ROSTER, False, "fresh-key")

    assert attempt["duplicate"] is False
    assert db.rpc_calls == []
    assert len(db.inserts) == 1


async def test_rpc_unavailable_falls_back_to_direct_update():
    db = _FakeSupabase(endings=[_stale_attempt()], leases=[], fail_rpc=True)
    manager = _RecoveryManager(db)

    attempt = await manager.begin_ending_attempt(
        "m1", ROSTER, False, "new-key")

    assert attempt["duplicate"] is False
    assert db.endings[0]["outcome"] == "failed"  # guarded direct update
    assert len(db.inserts) == 1
