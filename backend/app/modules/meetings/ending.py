"""Ending workflow (CONTRACTS sections 2-3): frozen roster, validated votes,
atomic summary/status commit, failure recovery, idempotent duplicates.

No transaction spans inference: votes and the summary are produced outside any
transaction, then one atomic commit persists the attempt outcome, votes,
usage, summary and meeting status together. A failed summary restores active
state with an auditable failed attempt. At most one summary exists per
meeting: duplicate end requests return the original outcome.
"""

from __future__ import annotations

import sqlite3
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional

from app.modules.meetings.domain import (
    MeetingState,
    decide_end,
    evaluate_votes,
)


class EndingConflict(Exception):
    """Concurrent ending attempt or duplicate with a different payload."""


@dataclass
class EndingOutcome:
    attempt_id: str
    status: MeetingState
    success: bool
    summary: Optional[str]
    votes: list[dict]
    usage: dict
    duplicate: bool = False


_ENDING_SCHEMA = """
CREATE TABLE IF NOT EXISTS ending_attempts (
    attempt_id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    force_end INTEGER NOT NULL DEFAULT 0,
    roster_json TEXT NOT NULL DEFAULT '[]',
    outcome TEXT NOT NULL DEFAULT 'in_progress',
    summary TEXT,
    usage_json TEXT NOT NULL DEFAULT '{}',
    created_at REAL NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ending_idem
    ON ending_attempts(meeting_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ending_one_summary
    ON ending_attempts(meeting_id) WHERE outcome = 'completed';
CREATE TABLE IF NOT EXISTS ending_votes (
    attempt_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    vote TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (attempt_id, participant_id)
);
"""


class SqliteEndingStore:
    """Real-SQL ending persistence proving atomic commit and rollback.

    Vote collection and summary generation happen outside; `commit` persists
    everything atomically. `fail_after_votes` simulates a crash between the
    vote writes and the terminal commit to prove rollback.
    """

    def __init__(self, path: Optional[str] = None):
        self._path = path or str(Path(tempfile.mkdtemp()) / "ending.db")
        self._local = threading.local()

    def _conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self._path, check_same_thread=False,
                                   isolation_level=None, timeout=10.0)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_ENDING_SCHEMA)
            self._local.conn = conn
        return conn

    def begin(self, meeting_id: str, roster: list[dict], force_end: bool,
              idempotency_key: str) -> dict:
        """Idempotent attempt creation. Same key returns the original
        attempt; a concurrent in-progress attempt raises EndingConflict."""
        import json

        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            row = conn.execute(
                "SELECT attempt_id, outcome, summary, usage_json, roster_json "
                "FROM ending_attempts WHERE meeting_id=? AND idempotency_key=?",
                (meeting_id, idempotency_key)).fetchone()
            if row is not None:
                conn.execute("ROLLBACK")
                return {"attempt_id": row[0], "outcome": row[1],
                        "summary": row[2], "usage": json.loads(row[3]),
                        "roster": json.loads(row[4]), "duplicate": True}
            live = conn.execute(
                "SELECT attempt_id FROM ending_attempts WHERE meeting_id=? "
                "AND outcome='in_progress'", (meeting_id,)).fetchone()
            if live is not None:
                conn.execute("ROLLBACK")
                raise EndingConflict("ending_in_progress")
            attempt_id = f"end-{uuid.uuid4()}"
            conn.execute(
                "INSERT INTO ending_attempts(attempt_id,meeting_id,"
                "idempotency_key,force_end,roster_json,outcome,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (attempt_id, meeting_id, idempotency_key, int(force_end),
                 json.dumps(roster), "in_progress", time.time()))
            conn.execute("COMMIT")
            return {"attempt_id": attempt_id, "outcome": "in_progress",
                    "summary": None, "usage": {}, "roster": roster,
                    "duplicate": False}
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def commit(self, attempt_id: str, votes: list[dict], summary: Optional[str],
               usage: dict, outcome: str, fail_after_votes: bool = False) -> None:
        """Atomic terminal commit: votes + attempt outcome + summary + usage
        land together or not at all."""
        import json

        conn = self._conn()
        conn.execute("BEGIN IMMEDIATE")
        try:
            for vote in votes:
                conn.execute(
                    "INSERT OR REPLACE INTO ending_votes(attempt_id,participant_id,"
                    "participant_name,vote,reason) VALUES(?,?,?,?,?)",
                    (attempt_id, vote["participant_id"], vote["participant_name"],
                     "yes" if vote["vote"] else "no", vote.get("reason", "")))
            if fail_after_votes:
                raise RuntimeError("injected crash between votes and terminal commit")
            conn.execute(
                "UPDATE ending_attempts SET outcome=?, summary=?, usage_json=? "
                "WHERE attempt_id=? AND outcome='in_progress'",
                (outcome, summary, json.dumps(usage), attempt_id))
            if conn.total_changes == 0:
                raise EndingConflict("attempt already terminalized")
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except sqlite3.Error:
                pass
            raise

    def votes_for(self, attempt_id: str) -> list[dict]:
        return [
            {"participant_id": r[0], "participant_name": r[1], "vote": r[2],
             "reason": r[3]}
            for r in self._conn().execute(
                "SELECT participant_id, participant_name, vote, reason "
                "FROM ending_votes WHERE attempt_id=?", (attempt_id,)).fetchall()
        ]

    def get(self, attempt_id: str) -> Optional[dict]:
        import json

        row = self._conn().execute(
            "SELECT attempt_id, meeting_id, force_end, roster_json, outcome, "
            "summary, usage_json FROM ending_attempts WHERE attempt_id=?",
            (attempt_id,)).fetchone()
        if row is None:
            return None
        return {"attempt_id": row[0], "meeting_id": row[1],
                "force_end": bool(row[2]), "roster": json.loads(row[3]),
                "outcome": row[4], "summary": row[5], "usage": json.loads(row[6])}


async def run_ending_attempt(
    *,
    store: SqliteEndingStore,
    meeting_id: str,
    roster: list[dict],
    force_end: bool,
    idempotency_key: str,
    collect_vote: Callable[[dict], Any],
    generate_summary: Callable[[list[dict]], Any],
    record_usage: Optional[Callable[[dict], None]] = None,
) -> EndingOutcome:
    """Orchestrate one ending attempt. Inference (votes, summary) happens
    outside any transaction; only the terminal commit is atomic."""
    attempt = store.begin(meeting_id, roster, force_end, idempotency_key)
    if attempt["duplicate"]:
        prior = store.get(attempt["attempt_id"])
        return EndingOutcome(
            attempt_id=prior["attempt_id"],
            status=MeetingState.ENDED if prior["outcome"] == "completed"
            else MeetingState.ACTIVE,
            success=prior["outcome"] == "completed",
            summary=prior["summary"], votes=store.votes_for(prior["attempt_id"]),
            usage=prior["usage"], duplicate=True)

    votes: list[dict] = []
    yes_count = 0
    invalid_count = 0
    usage: dict[str, int] = {}
    for member in roster:
        try:
            ballot = await collect_vote(member)
            yes = bool(ballot.get("vote"))
            votes.append({"participant_id": member["id"],
                          "participant_name": member["name"], "vote": yes,
                          "reason": str(ballot.get("reason", ""))[:500]})
            yes_count += 1 if yes else 0
        except Exception:
            invalid_count += 1
            votes.append({"participant_id": member["id"],
                          "participant_name": member["name"], "vote": False,
                          "reason": "invalid vote: counted as non-yes"})
    for ballot in votes:
        usage["vote_calls"] = usage.get("vote_calls", 0) + 1

    try:
        evaluation = evaluate_votes(roster_count=len(roster), yes_count=yes_count,
                                    invalid_count=invalid_count, force=force_end)
    except ValueError:
        store.commit(attempt["attempt_id"], votes, None, usage, "rejected")
        if record_usage:
            record_usage(usage)
        return EndingOutcome(attempt["attempt_id"], MeetingState.ACTIVE, False,
                             None, votes, usage)

    if not evaluation.should_end:
        store.commit(attempt["attempt_id"], votes, None, usage, "rejected")
        if record_usage:
            record_usage(usage)
        return EndingOutcome(attempt["attempt_id"], MeetingState.ACTIVE, False,
                             None, votes, usage)

    try:
        summary_text = await generate_summary(votes)
    except Exception:
        summary_text = None
    decision = decide_end(roster_count=len(roster), yes_count=yes_count,
                          invalid_count=invalid_count, force=force_end,
                          summary_failed=not summary_text,
                          summary_text=summary_text)
    usage["summary_calls"] = usage.get("summary_calls", 0) + 1
    store.commit(attempt["attempt_id"], votes, decision.summary, usage,
                 decision.attempt_outcome)
    if record_usage:
        record_usage(usage)
    return EndingOutcome(attempt["attempt_id"], decision.next_status,
                         decision.attempt_outcome == "completed",
                         decision.summary, votes, usage)
