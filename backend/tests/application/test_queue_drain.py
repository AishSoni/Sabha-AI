"""Stage A (A4): production queue drain.

FIFO dispatch through the shared exactly-once RPC wrapper, bounded, skipped
under active work or a non-active meeting; the orchestrator triggers a drain
after every turn terminalization (success or failure).
"""

import pytest

from app.services.meeting_manager import MeetingManager
from tests.doubles.repositories import FakeMeetingRepo

pytestmark = pytest.mark.anyio


def _meeting_dict(status="active"):
    from datetime import datetime, timezone

    return {"id": "m", "user_id": "actor-a", "name": "M", "agenda": "",
            "status": status, "archived_from": None, "total_cost": 0.0,
            "created_at": datetime.now(timezone.utc), "participants": [], "messages": []}


def _entries(n):
    return [{"entry_id": f"e{i}", "seq": i, "content": f"c{i}",
             "revision": 1, "state": "pending"} for i in range(1, n + 1)]


class _DrainManager(MeetingManager):
    """MeetingManager with Supabase-backed methods replaced in memory."""

    def __init__(self, entries=None, *, active=True, work=False, fail_codes=None):
        # Deliberately no super().__init__(): nothing here touches Supabase.
        self._rows = list(entries or [])
        self._active = active
        self._work = work
        self._fail_codes = dict(fail_codes or {})
        self.dispatched: list = []

    async def get_meeting(self, meeting_id):
        from app.models import MeetingWithParticipants

        return MeetingWithParticipants(**_meeting_dict(
            status="active" if self._active else "voting"))

    async def has_active_work(self, meeting_id):
        return self._work

    async def pending_queue_count(self, meeting_id):
        return len(self._rows)

    async def list_queue(self, meeting_id):
        return sorted((dict(r) for r in self._rows), key=lambda e: e["seq"])

    async def dispatch_queue_entry(self, entry_id):
        from app.modules.meetings.queue import QueueConflict

        if entry_id in self._fail_codes:
            code = self._fail_codes.pop(entry_id)
            # The RPC reports state it already observed: the row is no longer
            # pending from the caller's point of view.
            self._rows = [r for r in self._rows if r["entry_id"] != entry_id]
            raise QueueConflict(code)
        self.dispatched.append(entry_id)
        self._rows = [r for r in self._rows if r["entry_id"] != entry_id]
        return {"entry_id": entry_id, "message_id": f"msg-{entry_id}"}


async def test_drain_dispatches_fifo_until_empty():
    manager = _DrainManager(_entries(3))
    count = await manager.drain_queue("m")
    assert count == 3
    assert manager.dispatched == ["e1", "e2", "e3"]
    assert await manager.pending_queue_count("m") == 0


async def test_drain_skips_already_dispatched_and_continues():
    manager = _DrainManager(_entries(2), fail_codes={"e1": "already_dispatched"})
    count = await manager.drain_queue("m")
    assert manager.dispatched == ["e2"]
    assert count == 1


async def test_drain_stops_when_dispatch_unavailable():
    manager = _DrainManager(_entries(2), fail_codes={"e1": "dispatch_unavailable"})
    count = await manager.drain_queue("m")
    assert count == 0
    assert manager.dispatched == []
    # e1 left the pending set from the caller's view (fake mirrors the RPC's
    # observed state); e2 was never touched — the drain stopped in order.
    assert await manager.pending_queue_count("m") == 1


async def test_drain_skipped_under_active_work():
    manager = _DrainManager(_entries(1), work=True)
    assert await manager.drain_queue("m") == 0
    assert manager.dispatched == []


async def test_drain_skipped_when_meeting_not_active():
    manager = _DrainManager(_entries(1), active=False)
    assert await manager.drain_queue("m") == 0
    assert manager.dispatched == []


def _repo_with_drain():
    class _Repo(FakeMeetingRepo):
        def __init__(self):
            super().__init__()
            self.drain_calls = 0

        async def drain_queue(self, meeting_id):
            self.drain_calls += 1
            return 0

    return _Repo()


def _participant(meeting_id="m-drain", participant_id="p1"):
    from datetime import datetime, timezone

    from app.models import AIParticipant

    return AIParticipant(
        id=participant_id, meeting_id=meeting_id, name="AI One", role="analyst",
        system_prompt="Answer briefly.", created_at=datetime.now(timezone.utc),
    )


async def test_orchestrator_execute_turn_drains_after_terminal(monkeypatch):
    import app.services.orchestrator as orch_mod
    from app.services.orchestrator import Orchestrator
    from tests.doubles.providers import ScriptedProvider, final_text_response

    monkeypatch.setattr(
        orch_mod, "get_provider",
        lambda *a, **k: ScriptedProvider([final_text_response("done")]))
    repo = _repo_with_drain()
    repo.add_meeting("m-drain", participants=[_participant()], user_id="actor-a")

    await Orchestrator(meeting_manager=repo).execute_turn("m-drain", "p1")
    assert repo.drain_calls == 1


async def test_orchestrator_stream_drains_after_terminal(monkeypatch):
    import app.services.orchestrator as orch_mod
    from app.services.orchestrator import Orchestrator
    from tests.doubles.providers import ScriptedProvider, final_text_response

    monkeypatch.setattr(
        orch_mod, "get_provider",
        lambda *a, **k: ScriptedProvider([final_text_response("done")]))
    repo = _repo_with_drain()
    repo.add_meeting("m-drain-2", participants=[_participant("m-drain-2")],
                     user_id="actor-a")

    orch = Orchestrator(meeting_manager=repo)
    frames = [f async for f in orch.execute_turn_streaming("m-drain-2", "p1")]
    assert any(f["type"] == "turn_completed" for f in frames)
    assert repo.drain_calls >= 1
