"""Shared template-catalog contract (spec 06).

This file pins the behaviours of the persona-catalog port family that
serves template CRUD and coherent participant-creation snapshots. The
same behaviours must hold for every adapter that owns the catalog: the
in-memory fake the use-case tests wire and the real Supabase-RPC
adapter composition root wires, exactly like the prompt-activation
contract (spec 04) does for prompt selection.

A *world* bundles the port-shaped adapter under test with observations
of the persisted state and a failure injector. Contract functions must
not import app code — equivalence below is asserted through values,
rows, and exception texts ('persona_edit_conflict',
'unknown_knowledge_stacks', 'persona_not_found').

Behaviours pinned here:
- the coherent creation snapshot (persona + active prompt + ordered
  stack ids captured under the persona lock in ONE port call)
- atomic template creation (template + initial prompt + assignments in
  one transaction; a failing insert rolls all three back)
- guarded metadata updates (optimistic concurrency via
  expected_updated_at; stale expectations are refused with the
  previous state intact)
- assignment replacement atomicity (unknown stack ids persist nothing)
- template deletion (prompt history dies with the template; unknown
  templates report False)
"""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Awaitable, Callable

import pytest

PERSONA_ID = "77777777-7777-4777-7777-777777777777"
UNKNOWN_PERSONA_ID = "77777777-7777-4777-7777-777777777771"
NEW_PERSONA_ID = "77777777-7777-4777-7777-777777777778"
NEW_PROMPT_ID = "77777777-7777-4777-7777-777777777783"
V1_ID = "77777777-7777-4777-7777-777777777781"
STACK_A_ID = "55555555-5555-4555-8555-555555555551"
STACK_B_ID = "55555555-5555-4555-8555-555555555552"
GHOST_STACK_ID = "66666666-6666-4666-8666-666666666661"

TEMPLATE_CONFIG = {
    "provider": "openrouter",
    "model": "fixture/model",
    "temperature": 0.7,
    "max_tokens": 2000,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_independent_pair(
    first: Callable[[], Awaitable],
    second: Callable[[], Awaitable],
):
    """Run two port calls on independent sessions released together.

    Results keep the input order; the first failure is raised (which also
    releases a peer still waiting on the barrier).
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


class RpcCatalogPort:
    """Port-shaped driver over the real SQL RPC functions.

    Stand-in for ``app.modules.persona_catalog.infrastructure``: the
    transport is the real Postgres functions reached through the
    supabase stub, so the contract exercises actual locking,
    uniqueness, CAS checks and rollback semantics.
    """

    def __init__(self, stub) -> None:
        self._stub = stub

    async def read_creation_snapshot(self, persona_id: str) -> dict | None:
        result = self._stub.rpc(
            "read_persona_creation_snapshot",
            {"p_persona_id": persona_id},
        ).execute()
        return result.data  # None or a JSONB object

    async def create_persona(
        self,
        persona_id: str,
        name: str,
        *,
        subtitle: str | None,
        color: str | None,
        avatar_url: str | None,
        provider_config: dict,
        is_default: bool,
        user_id: str | None,
        system_prompt: str | None,
        prompt_id: str,
        created_at: str,
        stack_ids: list[str],
    ) -> dict:
        result = self._stub.rpc(
            "create_persona_transaction",
            {
                "p_persona_id": persona_id,
                "p_name": name,
                "p_subtitle": subtitle,
                "p_color": color,
                "p_avatar_url": avatar_url,
                "p_provider_config": provider_config,
                "p_is_default": is_default,
                "p_user_id": user_id,
                "p_prompt_id": prompt_id,
                "p_system_prompt": system_prompt,
                "p_created_at": created_at,
                "p_stack_ids": stack_ids,
            },
        ).execute()
        return result.data

    async def update_persona(
        self,
        persona_id: str,
        fields: dict,
        expected_updated_at: str | None,
        updated_at: str,
    ) -> dict:
        result = self._stub.rpc(
            "update_persona_transaction",
            {
                "p_persona_id": persona_id,
                "p_name": fields.get("name"),
                "p_subtitle": fields.get("subtitle"),
                "p_color": fields.get("color"),
                "p_avatar_url": fields.get("avatar_url"),
                "p_provider_config": fields.get("provider_config"),
                "p_stack_ids": fields["stack_ids"]
                if "stack_ids" in fields
                else None,
                "p_expected_updated_at": expected_updated_at,
                "p_updated_at": updated_at,
            },
        ).execute()
        assert isinstance(result.data, dict)
        return result.data

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        result = self._stub.rpc(
            "activate_prompt_version",
            {"p_persona_id": persona_id, "p_version": version},
        ).execute()
        return bool(result.data)

    async def delete_persona(self, persona_id: str) -> bool:
        # Prompt history first (cascade would handle it, be explicit),
        # then the template itself; mirrors the module's delete port.
        self._stub.table("prompt_versions").delete().eq(
            "persona_id", persona_id
        ).execute()
        result = (
            self._stub.table("personas")
            .delete()
            .eq("id", persona_id)
            .execute()
        )
        return len(result.data) > 0


class RealRpcWorld:
    """Contract world where the port is the real database."""

    def __init__(self, db) -> None:
        from psycopg.types.json import Json

        from tests.doubles.supabase_stub import stub_for

        self.db = db
        self.port = RpcCatalogPort(stub_for(db))
        self._fail_next_create = False
        self._seed(Json)

    def _seed(self, Json) -> None:
        now = _now()
        with self.db.connect() as conn:
            conn.execute(
                """
                INSERT INTO knowledge_stacks (id, name, description)
                VALUES (%s, 'Compliance Pack', 'Regulatory corpus'), (%s, 'Market Pack', 'Market corpus')
                """,
                (STACK_A_ID, STACK_B_ID),
            )
            conn.execute(
                """
                INSERT INTO personas
                    (id, name, subtitle, color, provider_config, is_default)
                VALUES (%s, 'Contract Advisor', 'Prompt Governance Lead', '#0ea5e9', %s, TRUE)
                """,
                (PERSONA_ID, Json(TEMPLATE_CONFIG)),
            )
            conn.execute(
                """
                INSERT INTO prompt_versions
                    (id, persona_id, version, content, is_active, created_at)
                VALUES
                    (%s, %s, 1, 'contract v1', TRUE, %s),
                    (%s, %s, 2, 'contract v2', FALSE, %s)
                """,
                (V1_ID, PERSONA_ID, now, "77777777-7777-4777-7777-777777777782", PERSONA_ID, now),
            )
            conn.execute(
                """
                INSERT INTO persona_knowledge_stacks (persona_id, stack_id)
                VALUES (%s, %s), (%s, %s)
                """,
                (PERSONA_ID, STACK_A_ID, PERSONA_ID, STACK_B_ID),
            )

    # -- observation --------------------------------------------------------

    def exists(self, persona_id: str) -> bool:
        return bool(
            self.db.query("SELECT 1 FROM personas WHERE id = %s", (persona_id,))
        )

    def state(self, persona_id: str = PERSONA_ID) -> dict:
        row = self.db.query(
            "SELECT name, subtitle, color, provider_config, updated_at FROM personas WHERE id = %s",
            (persona_id,),
        )
        if not row:
            return {}
        assignments = [
            r[0]
            for r in self.db.query(
                "SELECT stack_id FROM persona_knowledge_stacks WHERE persona_id = %s ORDER BY stack_id",
                (persona_id,),
            )
        ]
        versions = self.db.query(
            "SELECT version, content, is_active FROM prompt_versions WHERE persona_id = %s ORDER BY version",
            (persona_id,),
        )
        return {
            "name": row[0][0],
            "subtitle": row[0][1],
            "color": row[0][2],
            "provider_config": row[0][3],
            "stack_ids": [str(sid) for sid in assignments],
            "versions": [
                {"version": v, "content": c, "is_active": bool(a)} for v, c, a in versions
            ],
        }

    def current_updated_at(self, persona_id: str = PERSONA_ID):
        rows = self.db.query(
            "SELECT updated_at FROM personas WHERE id = %s", (persona_id,)
        )
        assert rows, "persona must exist"
        return rows[0][0].isoformat()

    def version_content(self, version: int) -> str:
        return {1: "contract v1", 2: "contract v2"}[version]

    # -- failure and drive harness -------------------------------------------

    def fail_next_create(self) -> None:
        """Next creation fails mid-transaction: the prompt insert collides
        with an already-used prompt id AFTER the template insert and the
        stack-assignment validation side have run."""
        self._fail_next_create = True

    async def read_snapshot(self, persona_id: str = PERSONA_ID) -> dict | None:
        return await self.port.read_creation_snapshot(persona_id)

    async def activate(self, version: int, persona_id: str = PERSONA_ID) -> bool:
        return await self.port.activate_prompt_version(persona_id, version)

    async def create(
        self,
        *,
        persona_id: str = NEW_PERSONA_ID,
        name: str = "Interview Coach",
        system_prompt: str | None = "starter directive",
        stack_ids: list[str] | None = None,
    ) -> dict:
        if self._fail_next_create:
            self._fail_next_create = False
            prompt_id = V1_ID  # unique collision inside the transaction
            prompt = "poisoned revision"
        else:
            prompt_id = NEW_PROMPT_ID
            prompt = system_prompt
        return await self.port.create_persona(
            persona_id,
            name,
            subtitle="Coaching Voice",
            color="#123456",
            avatar_url=None,
            provider_config=dict(TEMPLATE_CONFIG),
            is_default=False,
            user_id=None,
            system_prompt=prompt,
            prompt_id=prompt_id,
            created_at=_now(),
            stack_ids=stack_ids if stack_ids is not None else [STACK_A_ID, STACK_B_ID],
        )

    async def update(
        self,
        persona_id: str = PERSONA_ID,
        expected: str | None = None,
        **fields,
    ) -> dict:
        return await self.port.update_persona(
            persona_id, fields, expected, updated_at=_now()
        )

    async def delete(self, persona_id: str = PERSONA_ID) -> bool:
        return await self.port.delete_persona(persona_id)

    def run_pair(self, first, second):
        return run_independent_pair(first, second)


class FakeCatalogPort:
    """In-memory mirror of the three transactional semantics.

    State changes serialize under one lock — the fake's stand-in for the
    database persona-lock protocol — so CAS races and concurrent
    snapshot/activation pairs serialize exactly as the real functions
    guarantee.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stacks: set[str] = set()
        self._personas: dict[str, dict] = {}
        self._assignments: dict[str, list[str]] = {}
        self._versions: dict[str, list[dict]] = {}

    # -- seeding ------------------------------------------------------------

    def seed_stack(self, stack_id: str) -> None:
        self._stacks.add(stack_id)

    def seed_template(
        self,
        persona_id: str,
        name: str,
        *,
        provider_config: dict,
        subtitle: str = "Prompt Governance Lead",
        color: str = "#0ea5e9",
    ) -> None:
        self._personas[persona_id] = {
            "id": persona_id,
            "name": name,
            "subtitle": subtitle,
            "color": color,
            "avatar_url": None,
            "provider_config": dict(provider_config),
            "is_default": True,
            "user_id": None,
            "created_at": _now(),
            "updated_at": _now(),
        }

    def seed_version(
        self,
        persona_id: str,
        version: int,
        content: str,
        *,
        is_active: bool,
    ) -> None:
        self._versions.setdefault(persona_id, []).append(
            {
                "id": f"{persona_id}:{version}",
                "content": content,
                "version": version,
                "is_active": is_active,
            }
        )

    def seed_assignment(self, persona_id: str, stack_id: str) -> None:
        self._assignments.setdefault(persona_id, []).append(stack_id)

    # -- observation -----------------------------------------------------------

    def exists(self, persona_id: str) -> bool:
        return persona_id in self._personas

    def assignments_for(self, persona_id: str) -> list[str]:
        return sorted(self._assignments.get(persona_id, []))

    # -- port surface ------------------------------------------------------------

    async def read_creation_snapshot(self, persona_id: str) -> dict | None:
        with self._lock:
            template = self._personas.get(persona_id)
            if template is None:
                return None
            active = next(
                (row for row in self._versions.get(persona_id, []) if row["is_active"]),
                None,
            )
            return {
                **template,
                "active_prompt": active["content"] if active else None,
                "active_prompt_version": active["version"] if active else None,
                "stack_ids": self.assignments_for(persona_id),
            }

    async def create_persona(
        self,
        persona_id: str,
        name: str,
        *,
        subtitle: str | None,
        color: str | None,
        avatar_url: str | None,
        provider_config: dict,
        is_default: bool,
        user_id: str | None,
        system_prompt: str | None,
        prompt_id: str,
        created_at: str,
        stack_ids: list[str],
    ) -> dict:
        with self._lock:
            unknown = [sid for sid in stack_ids if sid not in self._stacks]
            if unknown:
                raise RuntimeError(
                    f"unknown_knowledge_stacks: {[str(sid) for sid in unknown]}"
                )
            row = {
                "id": persona_id,
                "name": name,
                "subtitle": subtitle,
                "color": color,
                "avatar_url": avatar_url,
                "provider_config": dict(provider_config),
                "is_default": is_default,
                "user_id": user_id,
                "created_at": created_at,
                "updated_at": created_at,
            }
            rollback = None
            try:
                self._personas[persona_id] = row
                if system_prompt is not None:
                    if any(
                        row_["id"] == prompt_id
                        for rows in self._versions.values()
                        for row_ in rows
                    ):
                        raise RuntimeError('duplicate key value violates unique constraint "prompt_versions_pkey"')
                    self._versions.setdefault(persona_id, []).append(
                        {
                            "id": prompt_id,
                            "content": system_prompt,
                            "version": 1,
                            "is_active": True,
                        }
                    )
                self._assignments.setdefault(persona_id, []).extend(
                    dict.fromkeys(stack_ids)  # deduped, order-preserving
                )
            except BaseException as exc:
                rollback = exc
                # the transaction rolls back: nothing persisted
                self._personas.pop(persona_id, None)
                raise rollback from None
            return dict(row)

    async def update_persona(
        self,
        persona_id: str,
        fields: dict,
        expected_updated_at: str | None,
        updated_at: str,
    ) -> dict:
        with self._lock:
            template = self._personas.get(persona_id)
            if template is None:
                raise RuntimeError("persona_not_found")
            if (
                expected_updated_at is not None
                and template["updated_at"] != expected_updated_at
            ):
                raise RuntimeError("persona_edit_conflict")
            for key in ("name", "subtitle", "color", "avatar_url", "provider_config"):
                if key in fields and fields[key] is not None:
                    template[key] = fields[key]
            template["updated_at"] = updated_at
            if fields.get("stack_ids") is not None:
                requested = list(dict.fromkeys(fields["stack_ids"]))
                unknown = [sid for sid in requested if sid not in self._stacks]
                if unknown:
                    raise RuntimeError(
                        f"unknown_knowledge_stacks: {[str(sid) for sid in unknown]}"
                    )
                self._assignments[persona_id] = requested
            return dict(template)

    async def activate_prompt_version(self, persona_id: str, version: int) -> bool:
        with self._lock:
            if persona_id not in self._personas:
                return False
            rows = self._versions.get(persona_id, [])
            if not any(row["version"] == version for row in rows):
                return False
            for row in rows:
                row["is_active"] = row["version"] == version
            self._personas[persona_id]["updated_at"] = _now()
            return True

    async def delete_persona(self, persona_id: str) -> bool:
        with self._lock:
            if persona_id not in self._personas:
                return False
            del self._personas[persona_id]
            self._versions.pop(persona_id, None)
            self._assignments.pop(persona_id, None)
            return True


class FakePortWorld:
    """Contract world where the port is the in-memory fake."""

    def __init__(self, db) -> None:
        self.db = db  # unused: the fake persists in memory
        self.port = FakeCatalogPort()
        self._fail_next_create = False
        self._seed()

    def _seed(self) -> None:
        self.port.seed_stack(STACK_A_ID)
        self.port.seed_stack(STACK_B_ID)
        self.port.seed_template(PERSONA_ID, "Contract Advisor", provider_config=TEMPLATE_CONFIG)
        self.port.seed_version(PERSONA_ID, 1, "contract v1", is_active=True)
        self.port.seed_version(PERSONA_ID, 2, "contract v2", is_active=False)
        self.port.seed_assignment(PERSONA_ID, STACK_A_ID)
        self.port.seed_assignment(PERSONA_ID, STACK_B_ID)

    # -- observation (same helpers as RealRpcWorld) ----------------------------

    def exists(self, persona_id: str) -> bool:
        return self.port.exists(persona_id)

    def state(self, persona_id: str = PERSONA_ID) -> dict:
        if not self.port.exists(persona_id):
            return {}
        rows = self.port._versions.get(persona_id, [])
        return {
            "name": self.port._personas[persona_id]["name"],
            "subtitle": self.port._personas[persona_id]["subtitle"],
            "color": self.port._personas[persona_id]["color"],
            "provider_config": self.port._personas[persona_id]["provider_config"],
            "stack_ids": self.port.assignments_for(persona_id),
            "versions": [
                {"version": r["version"], "content": r["content"], "is_active": r["is_active"]}
                for r in sorted(rows, key=lambda r: r["version"])
            ],
        }

    def current_updated_at(self, persona_id: str = PERSONA_ID) -> str:
        assert self.port.exists(persona_id), "persona must exist"
        return self.port._personas[persona_id]["updated_at"]

    def version_content(self, version: int) -> str:
        return {1: "contract v1", 2: "contract v2"}[version]

    # -- failure and drive harness ---------------------------------------------

    def fail_next_create(self) -> None:
        self._fail_next_create = True

    async def read_snapshot(self, persona_id: str = PERSONA_ID) -> dict | None:
        return await self.port.read_creation_snapshot(persona_id)

    async def activate(self, version: int, persona_id: str = PERSONA_ID) -> bool:
        return await self.port.activate_prompt_version(persona_id, version)

    async def create(
        self,
        *,
        persona_id: str = NEW_PERSONA_ID,
        name: str = "Interview Coach",
        system_prompt: str | None = "starter directive",
        stack_ids: list[str] | None = None,
    ) -> dict:
        fail = self._fail_next_create
        self._fail_next_create = False
        if fail:
            # collide with a prompt id that already exists in the store
            colliding_id = next(
                row["id"]
                for rows in self.port._versions.values()
                for row in rows
            )
        return await self.port.create_persona(
            persona_id,
            name,
            subtitle="Coaching Voice",
            color="#123456",
            avatar_url=None,
            provider_config=dict(TEMPLATE_CONFIG),
            is_default=False,
            user_id=None,
            system_prompt="poisoned revision" if fail else system_prompt,
            prompt_id=colliding_id if fail else NEW_PROMPT_ID,
            created_at=_now(),
            stack_ids=stack_ids if stack_ids is not None else [STACK_A_ID, STACK_B_ID],
        )

    async def update(
        self,
        persona_id: str = PERSONA_ID,
        expected: str | None = None,
        **fields,
    ) -> dict:
        return await self.port.update_persona(
            persona_id, fields, expected, updated_at=_now()
        )

    async def delete(self, persona_id: str = PERSONA_ID) -> bool:
        return await self.port.delete_persona(persona_id)

    def run_pair(self, first, second):
        return run_independent_pair(first, second)


def _real_rpc_world(disposable_db) -> RealRpcWorld:
    return RealRpcWorld(disposable_db)


def _fake_port_world(disposable_db) -> FakePortWorld:
    return FakePortWorld(disposable_db)


_WORLDS: list[Callable[..., object]] = [_real_rpc_world, _fake_port_world]


@pytest.fixture(params=_WORLDS, ids=lambda world_factory: world_factory.__name__)
def world(request, disposable_db):
    return request.param(disposable_db)


# ---------------------------------------------------------------------------
# Coherent creation snapshots
# ---------------------------------------------------------------------------


async def test_the_creation_snapshot_for_an_unknown_template_is_none(world):
    assert await world.read_snapshot(persona_id=UNKNOWN_PERSONA_ID) is None


async def test_the_snapshot_carries_the_template_its_active_prompt_and_ordered_stack_ids(world):
    snapshot = await world.read_snapshot()
    assert snapshot["name"] == "Contract Advisor"
    assert snapshot["provider_config"] == TEMPLATE_CONFIG
    assert snapshot["active_prompt"] == "contract v1"
    assert snapshot["active_prompt_version"] == 1
    assert snapshot["stack_ids"] == [STACK_A_ID, STACK_B_ID]


async def test_the_snapshot_serializes_with_a_concurrent_prompt_activation(world):
    snapshot, activated = world.run_pair(
        lambda: world.read_snapshot(),
        lambda: world.activate(2),
    )
    assert activated is True
    # The read captured one coherent template state: the prompt it carries
    # must match the version it recorded.
    seen_version = snapshot["active_prompt_version"]
    assert seen_version in (1, 2)
    assert snapshot["active_prompt"] == world.version_content(seen_version)
    assert snapshot["stack_ids"] == [STACK_A_ID, STACK_B_ID]

    final = await world.read_snapshot()
    assert final["active_prompt_version"] in (1, 2)
    assert final["active_prompt"] == world.version_content(final["active_prompt_version"])


# ---------------------------------------------------------------------------
# Atomic template creation
# ---------------------------------------------------------------------------


async def test_creation_persists_the_template_its_prompt_and_assignments(world):
    await world.create(name="Interview Coach")
    assert world.exists(NEW_PERSONA_ID) is True
    state = world.state(NEW_PERSONA_ID)
    assert state["name"] == "Interview Coach"
    assert state["stack_ids"] == [STACK_A_ID, STACK_B_ID]
    assert state["versions"] == [
        {"version": 1, "content": "starter directive", "is_active": True}
    ]


async def test_creation_with_unknown_stack_ids_persists_nothing(world):
    with pytest.raises(Exception, match="unknown_knowledge_stacks"):
        await world.create(stack_ids=[GHOST_STACK_ID])
    assert world.exists(NEW_PERSONA_ID) is False


async def test_a_failed_creation_rolls_back_the_whole_write(world):
    world.fail_next_create()
    with pytest.raises(Exception):
        await world.create(name="Interview Coach")
    assert world.exists(NEW_PERSONA_ID) is False


# ---------------------------------------------------------------------------
# Guarded updates (optimistic concurrency)
# ---------------------------------------------------------------------------


async def test_a_guarded_update_with_the_current_revision_writes(world):
    expected = world.current_updated_at()
    updated = await world.update(color="#123456", expected=expected)
    assert updated["color"] == "#123456"
    assert world.state()["color"] == "#123456"


async def test_a_guarded_update_on_an_unknown_template_raises(world):
    with pytest.raises(Exception, match="persona_not_found"):
        await world.update(persona_id=UNKNOWN_PERSONA_ID, name="Ghost", expected=None)


async def test_an_unguarded_update_still_writes_for_legacy_callers(world):
    original = await world.read_snapshot()
    assert original["name"] == "Contract Advisor"
    updated = await world.update(name="Renamed Advisor", expected=None)
    assert updated["name"] == "Renamed Advisor"
    assert world.state()["name"] == "Renamed Advisor"


async def test_a_stale_expected_revision_refuses_and_preserves_the_state(world):
    expected = world.current_updated_at()
    await world.update(name="Renamed Advisor", expected=None)  # bumps updated_at
    with pytest.raises(Exception, match="persona_edit_conflict"):
        await world.update(subtitle="Stale Editor Wins", expected=expected)
    state = world.state()
    assert state["name"] == "Renamed Advisor"
    assert state["subtitle"] == "Prompt Governance Lead"


async def test_concurrent_guarded_updates_allow_exactly_one_winning_write(world):
    expected = world.current_updated_at()

    async def attempt(name: str):
        try:
            await world.update(name=name, expected=expected)
            return "applied"
        except Exception as exc:
            assert "persona_edit_conflict" in str(exc)
            return "conflict"

    first, second = world.run_pair(
        lambda: attempt("Editor A"),
        lambda: attempt("Editor B"),
    )
    outcomes = sorted([first, second])
    assert outcomes == ["applied", "conflict"]
    assert world.state()["name"] in ("Editor A", "Editor B")


# ---------------------------------------------------------------------------
# Assignment replacement atomicity
# ---------------------------------------------------------------------------


async def test_an_unknown_stack_in_a_replacement_preserves_the_previous_assignments(world):
    expected = world.current_updated_at()
    with pytest.raises(Exception, match="unknown_knowledge_stacks"):
        await world.update(stack_ids=[STACK_A_ID, GHOST_STACK_ID], expected=expected)
    assert world.state()["stack_ids"] == [STACK_A_ID, STACK_B_ID]


async def test_a_successful_replacement_swaps_the_assignments(world):
    expected = world.current_updated_at()
    await world.update(stack_ids=[STACK_B_ID], expected=expected)
    assert world.state()["stack_ids"] == [STACK_B_ID]


# ---------------------------------------------------------------------------
# Template deletion
# ---------------------------------------------------------------------------


async def test_deleting_a_template_dies_together_with_its_prompt_history(world):
    deleted = await world.delete(PERSONA_ID)
    assert deleted is True
    assert world.exists(PERSONA_ID) is False
    state = world.state(PERSONA_ID)
    assert state == {}


async def test_deleting_an_unknown_template_reports_false(world):
    deleted = await world.delete(UNKNOWN_PERSONA_ID)
    assert deleted is False
