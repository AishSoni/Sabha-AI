"""Ending workflow matrix: majority/tie/zero-roster/invalid votes, summary
failure, force end, duplicates, concurrent attempts, crash-safe commit, and
usage from failed attempts (P04 TEST07 on real SQL)."""

import pytest

from app.modules.meetings.domain import MeetingState
from app.modules.meetings.ending import (
    EndingConflict,
    SqliteEndingStore,
    run_ending_attempt,
)

pytestmark = pytest.mark.anyio

ROSTER = [{"id": f"p{i}", "name": f"P{i}"} for i in range(3)]


async def _yes(member):
    return {"vote": True, "reason": "objectives met"}


async def _summary(votes):
    return "# Executive Summary\nDone."


async def _run(store, roster=ROSTER, force=False, key="k", vote=_yes,
               summary=_summary, used=None):
    return await run_ending_attempt(
        store=store, meeting_id="m", roster=roster, force_end=force,
        idempotency_key=key, collect_vote=vote, generate_summary=summary,
        record_usage=(used.append if used is not None else None))


async def test_majority_ends_with_single_summary_and_usage():
    store = SqliteEndingStore()
    used = []
    outcome = await _run(store, used=used)
    assert outcome.status == MeetingState.ENDED and outcome.success is True
    assert outcome.summary.startswith("# Executive Summary")
    assert used and used[0]["vote_calls"] == 3 and used[0]["summary_calls"] == 1
    assert len(store.votes_for(outcome.attempt_id)) == 3


async def test_tie_and_invalid_votes_restore_active_without_summary():
    store = SqliteEndingStore()
    roster4 = ROSTER + [{"id": "p3", "name": "P3"}]
    votes = [{"vote": True, "reason": "y"}, {"vote": True, "reason": "y"},
             {"vote": False, "reason": "n"}, {"vote": False, "reason": "n"}]

    async def _ballots(member):
        return votes.pop(0)

    outcome = await run_ending_attempt(
        store=store, meeting_id="m", roster=roster4, force_end=False,
        idempotency_key="tie", collect_vote=_ballots,
        generate_summary=_summary)
    assert outcome.status == MeetingState.ACTIVE and outcome.summary is None

    async def _raises(member):
        raise RuntimeError("provider down")

    outcome = await _run(store, key="invalid", vote=_raises)
    assert outcome.status == MeetingState.ACTIVE and outcome.summary is None
    assert len(store.votes_for(outcome.attempt_id)) == 3  # all persisted


async def test_zero_roster_rejects_but_force_end_summarizes():
    store = SqliteEndingStore()
    outcome = await _run(store, roster=[], key="zero")
    assert outcome.status == MeetingState.ACTIVE
    assert store.get(outcome.attempt_id)["outcome"] == "rejected"
    outcome = await _run(store, roster=[], force=True, key="forced")
    assert outcome.status == MeetingState.ENDED and outcome.summary is not None


async def test_summary_failure_restores_active_with_failed_attempt():
    store = SqliteEndingStore()

    async def _boom(votes):
        raise RuntimeError("summary provider down")

    outcome = await _run(store, key="sumfail", summary=_boom)
    assert outcome.status == MeetingState.ACTIVE and outcome.success is False
    assert outcome.summary is None
    assert store.get(outcome.attempt_id)["outcome"] == "failed"


async def test_duplicate_end_returns_original_without_second_summary():
    store = SqliteEndingStore()
    calls = []

    async def _counted(votes):
        calls.append(1)
        return "summary"

    first = await _run(store, key="dup", summary=_counted)
    second = await _run(store, key="dup", summary=_counted)
    assert second.duplicate is True
    assert second.attempt_id == first.attempt_id
    assert second.summary == first.summary
    assert len(calls) == 1  # one summary at most


async def test_concurrent_attempts_exactly_one_proceeds():
    import threading

    store = SqliteEndingStore()
    errors = []
    store.begin("m", ROSTER, False, "first")

    def compete():
        try:
            store.begin("m", ROSTER, False, "second")
        except EndingConflict as exc:  # noqa: BLE001
            errors.append(exc)

    thread = threading.Thread(target=compete)
    thread.start()
    thread.join()
    assert len(errors) == 1


async def test_crash_between_votes_and_commit_rolls_back():
    store = SqliteEndingStore()
    attempt = store.begin("m", ROSTER, False, "crash")
    votes = [{"participant_id": "p0", "participant_name": "P0",
              "vote": True, "reason": "y"}]
    with pytest.raises(RuntimeError, match="injected crash"):
        store.commit(attempt["attempt_id"], votes, "summary", {}, "completed",
                     fail_after_votes=True)
    assert store.votes_for(attempt["attempt_id"]) == []
    assert store.get(attempt["attempt_id"])["outcome"] == "in_progress"
    store.commit(attempt["attempt_id"], votes, "summary", {}, "completed")
    assert len(store.votes_for(attempt["attempt_id"])) == 1
