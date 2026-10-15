"""Demo session lifecycle: issuance/status/reset/expiry + fencing (P08-T03/T04).

Single-process fixture runtime with an injectable clock and a table-gateway
port. `InMemoryGateway` is the tested local default; `SupabaseGateway`
persists the same records to relational storage (migration
`007_demo_sessions.sql`) so a restart or a second process sees the same
authoritative state. All decisions (expiry math, windows, fencing) live in
`DemoSessionStore`, never in the gateway.

Semantics:
- Status/heartbeat reads never extend idle lifetime; only recorded
  actions/writes update `last_active_at`.
- Reset bumps generation and fences the old turn, but preserves lifetime
  abuse counters (`action_count`, write window, creation stats) so progress
  resets cannot bypass quotas.
- One scenario per session for life; rebinding conflicts.
- The store holds identifiers and counters only — never fixture content,
  tokens, or secrets — so retention sweeps cannot destroy shared fixtures.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Optional, Protocol

from app.infrastructure.demo import bounds, errors, tokens
from app.infrastructure.demo.capabilities import DemoUnavailable
from app.infrastructure.demo.manifest import REAL_SCENARIO_ID

DEMO_SESSIONS_TABLE = "demo_sessions"


def _check_synthetic_scenario(scenario_id: str) -> None:
    if scenario_id == REAL_SCENARIO_ID:
        raise DemoUnavailable("real_scenario_bootstrap", "owned by Phase 10")
    if not scenario_id.startswith("synthetic-"):
        raise DemoUnavailable(scenario_id, "demo serves synthetic fixtures only")


@dataclass(frozen=True)
class SessionView:
    """Public session shape: identifiers and counters, never credentials."""

    session_id: str
    generation: int
    scenario_id: str
    scenario_revision: int
    created_at: float
    last_active_at: float
    expires_at: float
    action_count: int


def _view(record: dict[str, Any]) -> SessionView:
    return SessionView(
        session_id=record["session_id"],
        generation=record["generation"],
        scenario_id=record["scenario_id"],
        scenario_revision=record["scenario_revision"],
        created_at=record["created_at"],
        last_active_at=record["last_active_at"],
        expires_at=record["expires_at"],
        action_count=record["action_count"],
    )


class SessionGateway(Protocol):
    """Persistence port: dict records keyed by token hash."""

    def get(self, token_hash: str) -> Optional[dict[str, Any]]: ...
    def put(self, record: dict[str, Any]) -> None: ...
    def delete(self, token_hash: str) -> None: ...
    def scan(self) -> list[dict[str, Any]]: ...


class InMemoryGateway:
    """Process-local gateway (tests + local fixture runtime)."""

    def __init__(self) -> None:
        self._records: dict[str, dict[str, Any]] = {}

    def get(self, token_hash: str) -> Optional[dict[str, Any]]:
        return self._records.get(token_hash)

    def put(self, record: dict[str, Any]) -> None:
        self._records[record["token_hash"]] = record

    def delete(self, token_hash: str) -> None:
        self._records.pop(token_hash, None)

    def scan(self) -> list[dict[str, Any]]:
        return list(self._records.values())


def _to_row(record: dict[str, Any]) -> dict[str, Any]:
    def _ts(value: float) -> str:
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()

    return {
        "session_id": record["session_id"],
        "token_hash": record["token_hash"],
        "generation": record["generation"],
        "scenario_id": record["scenario_id"],
        "scenario_revision": record["scenario_revision"],
        "created_at": _ts(record["created_at"]),
        "last_active_at": _ts(record["last_active_at"]),
        "expires_at": _ts(record["expires_at"]),
        "action_count": record["action_count"],
        "active_turn_id": record["active_turn_id"],
        "creation_key": record["creation_key"],
        "write_times": [
            datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
            for t in record["write_times"]
        ],
        "reset_keys": dict(record["reset_keys"]),
    }


def _from_row(row: dict[str, Any]) -> dict[str, Any]:
    def _epoch(value: Any) -> float:
        parsed = datetime.fromisoformat(str(value))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()

    def _epochs(values: Any) -> list[float]:
        return [_epoch(v) for v in (values or [])]

    return {
        "session_id": row["session_id"],
        "token_hash": row["token_hash"],
        "generation": int(row["generation"]),
        "scenario_id": row["scenario_id"],
        "scenario_revision": int(row["scenario_revision"]),
        "created_at": _epoch(row["created_at"]),
        "last_active_at": _epoch(row["last_active_at"]),
        "expires_at": _epoch(row["expires_at"]),
        "action_count": int(row["action_count"]),
        "active_turn_id": row.get("active_turn_id"),
        "creation_key": row.get("creation_key", "anonymous"),
        "write_times": _epochs(row.get("write_times")),
        "reset_keys": dict(row.get("reset_keys") or {}),
    }


class SupabaseGateway:
    """Relational gateway: same records, shared across processes/restarts.

    Requires migration `007_demo_sessions.sql` applied via the Supabase SQL
    editor (repo practice). Accepts an injected client for tests; otherwise
    uses the service-role client.
    """

    def __init__(self, client: Any = None) -> None:
        self._client = client

    def _db(self) -> Any:
        if self._client is not None:
            return self._client
        from app.core.database import get_supabase_admin

        return get_supabase_admin()

    def get(self, token_hash: str) -> Optional[dict[str, Any]]:
        response = (
            self._db()
            .table(DEMO_SESSIONS_TABLE)
            .select("*")
            .eq("token_hash", token_hash)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        return _from_row(rows[0]) if rows else None

    def put(self, record: dict[str, Any]) -> None:
        self._db().table(DEMO_SESSIONS_TABLE).upsert(
            _to_row(record), on_conflict="token_hash"
        ).execute()

    def delete(self, token_hash: str) -> None:
        self._db().table(DEMO_SESSIONS_TABLE).delete().eq(
            "token_hash", token_hash
        ).execute()

    def scan(self) -> list[dict[str, Any]]:
        response = self._db().table(DEMO_SESSIONS_TABLE).select("*").execute()
        return [_from_row(row) for row in (response.data or [])]


class DemoSessionStore:
    """Session lifecycle over any gateway; `clock` is injectable (tests)."""

    def __init__(
        self,
        gateway: Optional[SessionGateway] = None,
        clock: Optional[Callable[[], float]] = None,
    ) -> None:
        self._gateway = gateway or InMemoryGateway()
        self._clock = clock or time.time
        self._creations: dict[str, list[float]] = {}
        self._denials: dict[str, int] = {}
        self._total_issued = 0
        self._total_resets = 0
        self._failed_cleanups = 0

    # -- internals ------------------------------------------------------

    def _now(self) -> float:
        return self._clock()

    def _deny(self, code: str) -> None:
        self._denials[code] = self._denials.get(code, 0) + 1

    def _is_expired(self, record: dict[str, Any], now: float) -> bool:
        return (now - record["last_active_at"] > bounds.IDLE_TIMEOUT_S) or (
            now > record["expires_at"]
        )

    def _prune(self, stamps: list[float], now: float, window: float) -> list[float]:
        cutoff = now - window
        return [t for t in stamps if t > cutoff]

    def _live(self, token: str) -> dict[str, Any]:
        record = self._gateway.get(tokens.hash_token(token))
        if record is None:
            self._deny(errors.SessionNotFound().code)
            raise errors.SessionNotFound()
        if self._is_expired(record, self._now()):
            self._deny(errors.SessionExpired().code)
            raise errors.SessionExpired()
        return record

    def _fenced(self, record: dict[str, Any], expected_generation: int) -> None:
        if expected_generation != record["generation"]:
            self._deny(errors.StaleGeneration().code)
            raise errors.StaleGeneration(
                expected=record["generation"], got=expected_generation
            )

    # -- lifecycle ------------------------------------------------------

    def issue(
        self,
        *,
        scenario_id: str,
        scenario_revision: int,
        creation_key: str = "anonymous",
    ) -> tuple[SessionView, str]:
        """Issue one session + bearer token; stores the hash only."""
        _check_synthetic_scenario(scenario_id)
        now = self._now()
        window = self._prune(
            self._creations.get(creation_key, []), now, bounds.CREATION_WINDOW_S
        )
        if len(window) >= bounds.MAX_SESSION_CREATIONS_PER_HOUR:
            self._deny(errors.QuotaExceeded().code)
            raise errors.QuotaExceeded(
                scope="session_creation",
                limit=bounds.MAX_SESSION_CREATIONS_PER_HOUR,
                retry_after_s=max(1, int(window[0] + bounds.CREATION_WINDOW_S - now)),
            )
        live = [
            r for r in self._gateway.scan() if not self._is_expired(r, now)
        ]
        if len(live) >= bounds.MAX_ACTIVE_SESSIONS:
            self._deny(errors.QuotaExceeded().code)
            soonest = min(
                min(r["expires_at"], r["last_active_at"] + bounds.IDLE_TIMEOUT_S)
                - now
                for r in live
            )
            raise errors.QuotaExceeded(
                scope="global_active_sessions",
                limit=bounds.MAX_ACTIVE_SESSIONS,
                retry_after_s=max(1, int(soonest)),
            )
        token = tokens.issue_token()
        record = {
            "session_id": f"synthetic-session-{uuid.uuid4().hex[:12]}",
            "token_hash": tokens.hash_token(token),
            "generation": 1,
            "scenario_id": scenario_id,
            "scenario_revision": scenario_revision,
            "created_at": now,
            "last_active_at": now,
            "expires_at": now + bounds.ABSOLUTE_LIFETIME_S,
            "action_count": 0,
            "active_turn_id": None,
            "creation_key": creation_key,
            "write_times": [],
            "reset_keys": {},
        }
        self._gateway.put(record)
        window.append(now)
        self._creations[creation_key] = window
        self._total_issued += 1
        return _view(record), token

    def get_by_token(self, token: str) -> SessionView:
        """Status/heartbeat: verifies and checks expiry, never extends idle."""
        return _view(self._live(token))

    def record_action(
        self, token: str, *, expected_generation: int, payload_chars: int = 0
    ) -> SessionView:
        """Record one bounded action; extends idle lifetime only."""
        if payload_chars > bounds.MAX_ACTION_PAYLOAD_CHARS:
            self._deny(errors.QuotaExceeded().code)
            raise errors.QuotaExceeded(
                scope="request_payload",
                limit=bounds.MAX_ACTION_PAYLOAD_CHARS,
            )
        record = self._live(token)
        self._fenced(record, expected_generation)
        if record["action_count"] >= bounds.MAX_ACTIONS_PER_SESSION:
            self._deny(errors.QuotaExceeded().code)
            raise errors.QuotaExceeded(
                scope="session_actions",
                limit=bounds.MAX_ACTIONS_PER_SESSION,
            )
        record["action_count"] += 1
        record["last_active_at"] = self._now()
        self._gateway.put(record)
        return _view(record)

    def record_write(self, token: str, *, expected_generation: int) -> SessionView:
        """Record one write: action budget plus the per-minute window."""
        now = self._now()
        record = self._live(token)
        self._fenced(record, expected_generation)
        window = self._prune(record["write_times"], now, bounds.WRITE_WINDOW_S)
        if len(window) >= bounds.MAX_WRITES_PER_MINUTE:
            self._deny(errors.QuotaExceeded().code)
            raise errors.QuotaExceeded(
                scope="session_writes",
                limit=bounds.MAX_WRITES_PER_MINUTE,
                retry_after_s=max(1, int(window[0] + bounds.WRITE_WINDOW_S - now)),
            )
        if record["action_count"] >= bounds.MAX_ACTIONS_PER_SESSION:
            self._deny(errors.QuotaExceeded().code)
            raise errors.QuotaExceeded(
                scope="session_actions",
                limit=bounds.MAX_ACTIONS_PER_SESSION,
            )
        window.append(now)
        record["write_times"] = window
        record["action_count"] += 1
        record["last_active_at"] = now
        self._gateway.put(record)
        return _view(record)

    def reset(
        self,
        token: str,
        *,
        expected_generation: int,
        idempotency_key: str,
        scenario_id: Optional[str] = None,
    ) -> SessionView:
        """Reset progress: new generation, fenced turn, preserved counters.

        Retrying with the same key *and* generation is a no-op. A new
        expected generation is a new operation even if the key repeats.
        Lifetime abuse counters are never cleared by reset.
        """
        record = self._live(token)
        if scenario_id is not None and scenario_id != record["scenario_id"]:
            self._deny(errors.ScenarioConflict().code)
            raise errors.ScenarioConflict()
        if record["reset_keys"].get(idempotency_key) == expected_generation:
            return _view(record)
        self._fenced(record, expected_generation)
        record["generation"] += 1
        record["active_turn_id"] = None
        record["reset_keys"][idempotency_key] = expected_generation
        while len(record["reset_keys"]) > bounds.MAX_RESET_KEYS_PER_SESSION:
            oldest = next(iter(record["reset_keys"]))
            del record["reset_keys"][oldest]
        self._gateway.put(record)
        self._total_resets += 1
        return _view(record)

    # -- retention / insight --------------------------------------------

    def sweep(self, now: Optional[float] = None) -> dict[str, int]:
        """Remove expired sessions; per-record failures are counted, not fatal."""
        at = now if now is not None else self._now()
        removed, kept = 0, 0
        for record in self._gateway.scan():
            if not self._is_expired(record, at):
                kept += 1
                continue
            try:
                self._gateway.delete(record["token_hash"])
                removed += 1
            except Exception:
                self._failed_cleanups += 1
        return {
            "removed": removed,
            "kept": kept,
            "failed_cleanups": self._failed_cleanups,
        }

    def stats(self) -> dict[str, Any]:
        """Backlog/budget visibility for health checks (counts only)."""
        now = self._now()
        active, expired_pending = 0, 0
        for record in self._gateway.scan():
            if self._is_expired(record, now):
                expired_pending += 1
            else:
                active += 1
        return {
            "active_sessions": active,
            "expired_pending": expired_pending,
            "total_issued": self._total_issued,
            "total_resets": self._total_resets,
            "denials": dict(self._denials),
            "failed_cleanups": self._failed_cleanups,
        }
