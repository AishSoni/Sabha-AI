"""Supabase gateway query contract (recording fake, no network).

Verifies the persistent gateway issues the exact table/filter/upsert shape
the migration provides, and that the full store lifecycle works unchanged
over the Supabase adapter (shared logic, different persistence).
"""

from types import SimpleNamespace

import pytest

from app.infrastructure.demo.runtime import (
    DEMO_SESSIONS_TABLE,
    DemoSessionStore,
    SupabaseGateway,
)


class FakeQuery:
    def __init__(self, table, op):
        self._table = table
        self._op = op
        self._filters = []
        self._limit = None
        self._row = None
        self._conflict = None

    def select(self, _cols):
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def limit(self, count):
        self._limit = count
        return self

    def upsert(self, row, on_conflict=None):
        self._op = "upsert"
        self._row = row
        self._conflict = on_conflict
        return self

    def delete(self):
        self._op = "delete"
        return self

    def _matched(self):
        rows = list(self._table.rows)
        for column, value in self._filters:
            rows = [r for r in rows if r.get(column) == value]
        if self._limit is not None:
            rows = rows[: self._limit]
        return rows

    def execute(self):
        self._table.calls.append(
            {"op": self._op, "filters": list(self._filters)}
        )
        if self._op == "upsert":
            key = self._conflict
            self._table.rows = [
                r for r in self._table.rows if r.get(key) != self._row.get(key)
            ]
            self._table.rows.append(dict(self._row))
            return SimpleNamespace(data=[self._row])
        if self._op == "delete":
            doomed = self._matched()
            self._table.rows = [r for r in self._table.rows if r not in doomed]
            return SimpleNamespace(data=doomed)
        return SimpleNamespace(data=self._matched())


class FakeTable:
    def __init__(self, client):
        self._client = client

    @property
    def rows(self):
        return self._client.rows

    @rows.setter
    def rows(self, value):
        self._client.rows = value

    @property
    def calls(self):
        return self._client.calls

    def select(self, cols):
        return FakeQuery(self, "select").select(cols)

    def upsert(self, row, on_conflict=None):
        return FakeQuery(self, "upsert").upsert(row, on_conflict=on_conflict)

    def delete(self):
        return FakeQuery(self, "delete").delete()


class FakeClient:
    def __init__(self):
        self.rows = []
        self.calls = []
        self.tables = []

    def table(self, name):
        self.tables.append(name)
        return FakeTable(self)


@pytest.fixture
def fake_client():
    return FakeClient()


@pytest.fixture
def gateway(fake_client):
    return SupabaseGateway(client=fake_client)


def test_put_get_round_trip_preserves_times(gateway):
    store = DemoSessionStore(gateway=gateway)
    view, token = store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="k",
    )
    assert gateway.get("missing-hash") is None
    reread = store.get_by_token(token)
    assert reread.session_id == view.session_id
    assert abs(reread.created_at - view.created_at) < 1.0


def test_upsert_conflicts_on_token_hash_and_scan_lists_all(gateway, fake_client):
    store = DemoSessionStore(gateway=gateway)
    first, _ = store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="a",
    )
    store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="b",
    )
    assert len(gateway.scan()) == 2
    assert set(fake_client.tables) == {DEMO_SESSIONS_TABLE}
    assert first.session_id in {r["session_id"] for r in gateway.scan()}


def test_delete_removes_only_the_target_row(gateway):
    store = DemoSessionStore(gateway=gateway)
    _, gone_token = store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="a",
    )
    keep_view, _ = store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="b",
    )
    from app.infrastructure.demo import tokens as token_mod

    gateway.delete(token_mod.hash_token(gone_token))
    remaining = gateway.scan()
    assert [r["session_id"] for r in remaining] == [keep_view.session_id]


def test_full_lifecycle_over_supabase_gateway(gateway):
    from app.infrastructure.demo import bounds

    store = DemoSessionStore(gateway=gateway)
    _, token = store.issue(
        scenario_id="synthetic-smoke-scaffold",
        scenario_revision=1,
        creation_key="k",
    )
    store.record_write(token, expected_generation=1)
    view = store.reset(token, expected_generation=1, idempotency_key="r1")
    assert view.generation == 2
    assert view.action_count == 1  # counters survive reset, even persistent
    swept = store.sweep(now=view.expires_at + bounds.IDLE_TIMEOUT_S + 1)
    assert swept["removed"] == 1
