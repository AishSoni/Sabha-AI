"""Stage A (A5): ending-attempt journal + shared execution path.

Pins CONTRACTS section 10: v2 envelopes carrying ending_attempt_id (never a
forged turn_id), ordered publication after each entry's own persistence,
exactly one terminal event, and summary deltas before the terminal commit.
"""

import pytest

from app.llm.base import LLMResponse
from tests.doubles.providers import ScriptedProvider
from tests.doubles.repositories import FakeEndingManager

pytestmark = pytest.mark.anyio

ROSTER = [{"id": "p1", "name": "Alice"}, {"id": "p2", "name": "Bob"}]


def _ballot(vote: bool, reason: str) -> LLMResponse:
    return LLMResponse(
        content=f'{{"vote": {"true" if vote else "false"}, '
                f'"reason": "{reason}"}}',
        tool_calls=[], finish_reason="stop", usage={})


def _summary(text: str) -> LLMResponse:
    return LLMResponse(content=text, tool_calls=[], finish_reason="stop",
                       usage={})


async def test_envelope_carries_ending_attempt_id_not_turn_id():
    from app.modules.meetings.ending import get_shared_ending_journal

    journal = get_shared_ending_journal()
    await journal.begin("end-abc", "m-1")
    event = await journal.append("end-abc", "ending_started",
                                 {"force_end": True})
    assert event["version"] == 2
    assert event["ending_attempt_id"] == "end-abc"
    assert event["turn_id"] is None
    assert event["event_id"] == "end-abc:1"
    assert event["sequence"] == 1
    assert event["meeting_id"] == "m-1"
    assert event["type"] == "ending_started"


async def test_journal_replay_after_cursor_until_single_terminal():
    from app.modules.meetings.ending import get_shared_ending_journal

    journal = get_shared_ending_journal()
    await journal.begin("end-r", "m")
    await journal.append("end-r", "ending_started", {})
    await journal.append("end-r", "ending_completed", {"outcome": "completed"})

    tail = await journal.list_events("end-r", after=1)
    assert [e["type"] for e in tail] == ["ending_completed"]

    replayed = [e["type"] async for e in journal.subscribe("end-r", after=0)]
    assert replayed == ["ending_started", "ending_completed"]

    # Exactly one terminal: post-terminal appends are dropped.
    assert await journal.append("end-r", "ending_failed", {}) is None
    terminals = [e for e in await journal.list_events("end-r")
                 if e["type"] in ("ending_completed", "ending_failed")]
    assert len(terminals) == 1


async def test_prepare_rolls_back_attempt_when_lease_lost():
    """A racing turn (lease denied) must not leave a blocking attempt row."""
    import app.api.meetings as meetings_api
    from app.modules.meetings.ending import (
        EndingConflict, get_shared_ending_journal,
    )

    manager = FakeEndingManager()
    manager.active_work = True  # fake claim raises like the Supabase path
    with pytest.raises(EndingConflict, match="turn_in_progress"):
        await meetings_api._prepare_ending(
            manager, "m", ROSTER, False, "key-roll")
    assert manager.begin_calls == 1
    # Fresh attempt was committed failed so it cannot block the meeting.
    assert manager.commit_calls == [
        ("end-fake-1", "failed", None, {})]
    # No journal record: nothing to stream for a rolled-back attempt.
    assert not get_shared_ending_journal().has("end-fake-1")


async def test_duplicate_begin_short_circuits_without_journal():
    import app.api.meetings as meetings_api
    from app.modules.meetings.ending import get_shared_ending_journal

    manager = FakeEndingManager()
    manager.duplicate_next = True
    attempt = await meetings_api._prepare_ending(
        manager, "m", ROSTER, True, "key-dup")
    assert attempt["duplicate"] is True
    assert manager.begin_calls == 1
    assert manager.leased == []
    assert not get_shared_ending_journal().has("end-dup")


async def test_force_end_publishes_summary_deltas_before_terminal(
        monkeypatch):
    import app.api.meetings as meetings_api
    from app.modules.meetings.ending import get_shared_ending_journal

    provider = ScriptedProvider([_summary("EXECUTIVE SUMMARY BODY")])
    monkeypatch.setattr(meetings_api, "get_provider",
                        lambda *a, **k: provider)
    manager = FakeEndingManager()
    attempt = await meetings_api._prepare_ending(
        manager, "m", ROSTER, True, "key-force")
    meeting = await manager.get_meeting("m")
    response = await meetings_api._execute_ending(
        manager, meeting, ROSTER, True, attempt)

    assert response.success is True
    assert response.summary == "EXECUTIVE SUMMARY BODY"
    events = await get_shared_ending_journal().list_events(
        attempt["attempt_id"])
    types = [e["type"] for e in events]
    assert types[0] == "ending_started"
    assert "summary_started" in types
    assert "summary_delta" in types
    assert types[-1] == "ending_completed"
    assert types.count("ending_completed") == 1
    assert types.index("summary_delta") < types.index("ending_completed")
    deltas = "".join(e["data"]["content"] for e in events
                     if e["type"] == "summary_delta")
    assert deltas == "EXECUTIVE SUMMARY BODY"
    assert manager.commit_calls[-1][1] == "completed"
    assert manager.released == ["m"]


async def test_vote_path_persists_each_vote_before_terminal(monkeypatch):
    import app.api.meetings as meetings_api
    from app.modules.meetings.ending import get_shared_ending_journal

    provider = ScriptedProvider([
        _ballot(True, "aligned"),
        _ballot(True, "aligned"),
        _summary("FINAL SUMMARY"),
    ])
    monkeypatch.setattr(meetings_api, "get_provider",
                        lambda *a, **k: provider)
    manager = FakeEndingManager()
    attempt = await meetings_api._prepare_ending(
        manager, "m", ROSTER, False, "key-votes")
    meeting = await manager.get_meeting("m")
    response = await meetings_api._execute_ending(
        manager, meeting, ROSTER, False, attempt)

    assert response.success is True
    events = await get_shared_ending_journal().list_events(
        attempt["attempt_id"])
    types = [e["type"] for e in events]
    vd = [i for i, t in enumerate(types) if t == "vote_delta"]
    vr = [i for i, t in enumerate(types) if t == "vote_recorded"]
    assert len(vd) == 2 and len(vr) == 2
    assert vd[0] < vr[0] < vd[1] < vr[1]
    assert vr[1] < types.index("summary_started")
    assert types.index("summary_delta") < types.index("ending_completed")
    # Per-vote persistence happened (single-vote record calls) before the
    # terminal batch; ballots actually landed.
    single = [v for _, v in manager.record_calls if len(v) == 1]
    assert len(single) >= 2
    assert single[0][0]["vote"] is True
    assert len(provider.calls) == 3  # two votes + summary


async def test_rejected_votes_commit_rejection_terminal(monkeypatch):
    import app.api.meetings as meetings_api
    from app.modules.meetings.ending import get_shared_ending_journal

    provider = ScriptedProvider([
        _ballot(False, "more to discuss"),
        _ballot(False, "not done"),
    ])
    monkeypatch.setattr(meetings_api, "get_provider",
                        lambda *a, **k: provider)
    manager = FakeEndingManager()
    attempt = await meetings_api._prepare_ending(
        manager, "m", ROSTER, False, "key-reject")
    meeting = await manager.get_meeting("m")
    response = await meetings_api._execute_ending(
        manager, meeting, ROSTER, False, attempt)

    assert response.success is False
    assert "Vote failed" in response.message
    events = await get_shared_ending_journal().list_events(
        attempt["attempt_id"])
    terminal = events[-1]
    assert terminal["type"] == "ending_completed"
    assert terminal["data"]["outcome"] == "rejected"
    assert terminal["data"]["committed"] is True
    assert manager.commit_calls[-1][1] == "rejected"
    assert ("m", "active") in [
        (mid, str(status)) for mid, status in manager.status_updates]
    assert not any(e["type"] == "summary_delta" for e in events)
    assert len(provider.calls) == 2  # summary never requested


async def test_summary_failure_publishes_ending_failed(monkeypatch):
    import app.api.meetings as meetings_api
    from app.modules.meetings.ending import get_shared_ending_journal

    provider = ScriptedProvider([
        _ballot(True, "done"),
        _ballot(True, "done"),
        RuntimeError("summary boom"),
    ])
    monkeypatch.setattr(meetings_api, "get_provider",
                        lambda *a, **k: provider)
    manager = FakeEndingManager()
    attempt = await meetings_api._prepare_ending(
        manager, "m", ROSTER, False, "key-sumfail")
    meeting = await manager.get_meeting("m")
    response = await meetings_api._execute_ending(
        manager, meeting, ROSTER, False, attempt)

    assert response.success is False
    assert "Summary generation failed" in response.message
    events = await get_shared_ending_journal().list_events(
        attempt["attempt_id"])
    assert events[-1]["type"] == "ending_failed"
    assert events[-1]["data"]["code"] == "summary_failed"
    assert events[-1]["data"]["retryable"] is True
    assert manager.commit_calls[-1][1] == "failed"
    assert ("m", "active") in [
        (mid, str(status)) for mid, status in manager.status_updates]
