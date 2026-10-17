"""Part B package acceptance: DB-backed genuine research seed (P10-TEST06/TEST17 content side).

Offline only: relies on the conftest network guard, uses a fake table client,
never touches live services. Fails honestly on missing assets; import is
idempotent; package carries no precompleted visitor effects.
"""

import copy

import pytest

pytestmark = pytest.mark.anyio


class _FakeTable:
    def __init__(self, store):
        self._store = store
        self._filters = {}

    def upsert(self, row, on_conflict=None):
        key = (row["scenario_id"], row["content_version"], row["scenario_revision"])
        self._store[key] = row
        return self

    def select(self, *args):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def limit(self, n):
        return self

    def execute(self):
        key = (
            self._filters.get("scenario_id"),
            self._filters.get("content_version"),
            self._filters.get("scenario_revision"),
        )
        rows = []
        if key in self._store:
            stored = self._store[key]
            rows = [{"package": stored["package"]}]
        return type("Response", (), {"data": rows})()


class _FakeClient:
    def __init__(self, store):
        self._store = store

    def table(self, name):
        assert name == "demo_bond_packages"
        return _FakeTable(self._store)


def test_seed_package_is_genuine_demo_grade():
    from app.infrastructure.demo.bond_package import load_seed_package, validate_package

    pkg = validate_package(load_seed_package())
    assert pkg["scenario_id"] == "indian-corporate-bond-review"
    assert pkg["instrument"]["isin"] == "INE001A07RW5"
    assert pkg["recorded_analysis"] is True
    assert len(pkg["sources"]) == 5
    for source in pkg["sources"]:
        assert source["excerpt"].strip()
        assert source.get("url") or source["source_id"] == "downside-worksheet-v1"
    note = pkg["run_note"]
    assert note["auth"] is None
    assert "No live" in note["honest_status"]
    assert note["live_services_used"] == []
    assert len(pkg["recorded_invocations"]) >= 4
    call_ids = [r["provider_call_id"] for r in pkg["recorded_invocations"]]
    assert "call-disagree-1" in call_ids
    assert "call-consensus-1" in call_ids
    assert "recorded analysis" in pkg["disclosure"].lower()
    assert "not financial advice" in pkg["disclosure"].lower()


def test_missing_source_fails_honestly():
    from app.infrastructure.demo.bond_package import (
        PackageMissingError,
        load_seed_package,
        validate_package,
    )

    pkg = load_seed_package()
    broken = copy.deepcopy(pkg)
    broken["sources"] = [s for s in broken["sources"] if s["source_id"] != "market-evidence-v1"]
    with pytest.raises(PackageMissingError, match="missing required sources"):
        validate_package(broken)


def test_package_carries_no_visitor_effects():
    from app.infrastructure.demo.bond_package import load_seed_package, validate_package

    pkg = validate_package(load_seed_package())
    for forbidden in ("meeting_id", "messages", "votes"):
        assert forbidden not in pkg


def test_import_is_idempotent_and_pinned_load_works():
    from app.infrastructure.demo.bond_package import (
        import_package,
        load_pinned_package,
        load_seed_package,
    )

    store = {}
    client = _FakeClient(store)
    first = import_package(client, load_seed_package())
    second = import_package(client, load_seed_package())
    assert len(store) == 1
    assert first == second
    pinned = load_pinned_package(client)
    assert pinned["instrument"]["isin"] == "INE001A07RW5"


def test_pinned_load_fails_closed_without_import():
    from app.infrastructure.demo.bond_package import PackageMissingError, load_pinned_package

    with pytest.raises(PackageMissingError, match="not found"):
        load_pinned_package(_FakeClient({}))


def test_migration_009_adds_package_table():
    from pathlib import Path

    sql = Path(__file__).resolve().parents[2] / "migrations" / "009_demo_bond_package.sql"
    sql = sql if sql.exists() else Path(__file__).resolve().parents[1] / "migrations" / "009_demo_bond_package.sql"
    sql = Path(sql).read_text()
    assert "demo_bond_packages" in sql
    assert "content_version" in sql
    assert "scenario_revision" in sql
