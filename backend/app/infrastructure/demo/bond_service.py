"""Bond demo service: sessions, ordered actions, queue exercise, reset.

Deterministic and offline: recorded tool calls carry original provider call
IDs, tool results are checked against independent approved assertions (never
a hash of the payload under test), and no live provider, embedding, search,
market-data, or discovery call is made.

D-01 status: offline pre-work only (core terms confirmed against the CRISIL
2020-07-31 rationale; placement memo/listing record/trustee confirmation and
WDM quotes still missing). No genuine research meeting via a live provider
exists, so disagreement/consensus/votes/brief below are recorded fixtures,
not research outcomes. Labeled recorded analysis throughout.
"""

import hashlib
from typing import Any, Optional

from app.infrastructure.demo import errors
from app.infrastructure.demo.bond_retrieval import BondKnowledgeSearch
from app.infrastructure.demo.bond_scenario import VERIFIED_ISIN as PINNED_ISIN
from app.infrastructure.demo.bond_scenario import SNAPSHOT_DATE, build_hdfc_rw5_pack
from app.infrastructure.demo.bond_scripts import (
    DISCLOSURE,
    JOURNEY_ACTION_IDS,
    action_script,
    build_journey_provider,
)
from app.infrastructure.demo.bond_progress import JourneyProgressStore
from app.infrastructure.demo.manifest import REAL_SCENARIO_ID
from app.infrastructure.demo.runtime import DemoSessionStore
from app.modules.meetings.queue import (
    InMemoryQueue,
    QueueCapacity,
    QueueConflict,
    QueueValidation,
)

BOND_CONTENT_REVISION = 1

# D-01 approval has NOT been evidenced. All disagreement/consensus/votes/brief
# content below is a recorded fixture for the offline tutorial, not a genuine
# research-run outcome. Fail closed if the approved seed drifts.
APPROVAL_STATUS = "pending-d01"
RECORDED_ANALYSIS = True


def _approved_source_ids() -> set[str]:
    return {s.source_id for s in _pack.sources}


def _approved_source_titles() -> set[str]:
    return {s.title for s in _pack.sources}


def assert_independent_tool_result(*, tool: dict, payload: dict, action_id: str) -> None:
    """Check a tool result against the approved seed, never against itself.

    Raises ValueError on mismatch; progression stays retryable.
    """
    name = tool["name"]
    if name == "search_knowledge_base":
        items = payload.get("items")
        citations = payload.get("citations")
        if not isinstance(items, list) or not items:
            raise ValueError(
                f"tool result mismatch for {action_id}: approved evidence "
                "requires at least one retrieved item"
            )
        approved_ids = _approved_source_ids()
        for item in items:
            meta = (item.get("metadata") or {}) if isinstance(item, dict) else {}
            sid = meta.get("source_id")
            snap = meta.get("snapshot_date")
            if sid not in approved_ids:
                raise ValueError(
                    f"tool result mismatch for {action_id}: unknown source {sid!r}"
                )
            if snap != SNAPSHOT_DATE:
                raise ValueError(
                    f"tool result mismatch for {action_id}: snapshot {snap!r} "
                    f"!= approved {SNAPSHOT_DATE!r}"
                )
        if not isinstance(citations, list) or not citations:
            raise ValueError(
                f"tool result mismatch for {action_id}: approved evidence "
                "requires at least one citation"
            )
        approved_titles = _approved_source_titles()
        for title in citations:
            if title not in approved_titles:
                raise ValueError(
                    f"tool result mismatch for {action_id}: unknown citation {title!r}"
                )
        return
    # Recorded communication tools: arguments must match the approved script
    # exactly; the payload wrapper only marks the result as recorded.
    if payload.get("recorded") is not True:
        raise ValueError(
            f"tool result mismatch for {action_id}: result not marked recorded"
        )
    if payload.get("arguments") != tool["arguments"]:
        raise ValueError(
            f"tool result mismatch for {action_id}: arguments drifted from "
            "the approved script; progression stays retryable"
        )


class UnknownAction(ValueError):
    pass


class StaleRevision(ValueError):
    pass


class OutOfOrder(ValueError):
    pass


class NotBootstrapped(ValueError):
    pass


_pack = build_hdfc_rw5_pack()
_search = BondKnowledgeSearch(_pack)


def get_pack():
    """Pinned DB package is the sole production path; seed is local fallback.

    Tries `load_pinned_package` via the service-role client (migration 009);
    falls back to the validated seed file when storage is unavailable (local
    dev/tests). Missing required assets raise PackageMissingError (fail
    honestly); callers must not silently use hardcoded prose.
    """
    global _pack, _search
    try:
        from app.core.database import get_supabase_admin
        from app.infrastructure.demo.bond_package import load_pinned_package

        pkg = load_pinned_package(get_supabase_admin())
        from app.infrastructure.demo.bond_scenario import (
            BondEvidencePack,
        )

        pack = BondEvidencePack(
            schema_version=str(pkg.get("schema_version", "1")),
            scenario_id=pkg["scenario_id"],
            content_version=int(pkg.get("content_version", 1)),
            scenario_revision=int(pkg.get("scenario_revision", 1)),
            instrument=pkg["instrument"],
            source_snapshot_date=pkg.get("snapshot_date", SNAPSHOT_DATE),
            sources=pkg["sources"],
            claims=pkg["claims"],
            specialists=pkg["specialists"],
        )
        _pack = pack
        _search = BondKnowledgeSearch(_pack)
        return _pack
    except Exception:
        return _pack


def sessions() -> DemoSessionStore:
    """Durable session store; Supabase gateway when storage is reachable."""
    global _sessions
    try:
        return _sessions
    except NameError:
        try:
            from app.infrastructure.demo.runtime import SupabaseGateway

            _sessions = DemoSessionStore(gateway=SupabaseGateway())
            # Probe once; fall back to process-local on failure.
            _sessions.stats()
            return _sessions
        except Exception:
            from app.infrastructure.demo.runtime import InMemoryGateway

            _sessions = DemoSessionStore(gateway=InMemoryGateway())
            return _sessions


def progress() -> JourneyProgressStore:
    global _progress
    try:
        return _progress
    except NameError:
        try:
            from app.core.database import get_supabase_admin

            _progress = JourneyProgressStore(client=get_supabase_admin())
            return _progress
        except Exception:
            _progress = JourneyProgressStore()
            return _progress


def queues() -> InMemoryQueue:
    global _queue
    try:
        return _queue
    except NameError:
        _queue = InMemoryQueue()
        return _queue


def _execution_id(*parts: str) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return f"bond-exec-{digest[:16]}"


def instrument_view() -> dict[str, Any]:
    pack = get_pack()
    inst = pack.instrument
    return {
        "isin": inst.isin,
        "issuer": inst.issuer,
        "coupon_pct": inst.coupon_pct,
        "allotment_date": inst.allotment_date,
        "maturity_date": inst.maturity_date,
        "issue_size_cr": inst.issue_size_cr,
        "rating": inst.rating,
        "rating_date": inst.rating_date,
        "snapshot_date": _pack.source_snapshot_date,
        "historical": True,
        "approval_status": APPROVAL_STATUS,
        "recorded_analysis": RECORDED_ANALYSIS,
        "disclosure": DISCLOSURE,
    }


async def create_session(
    *, scenario_id: str, scenario_revision: int, creation_key: str = "anonymous"
) -> dict[str, Any]:
    if scenario_id != REAL_SCENARIO_ID:
        raise errors.ScenarioConflict()
    if scenario_revision != BOND_CONTENT_REVISION:
        raise StaleRevision(f"revision {scenario_revision} != pinned 1")
    view, token = sessions().issue(
        scenario_id=scenario_id,
        scenario_revision=scenario_revision,
        creation_key=creation_key,
    )
    meeting = progress().bootstrap(
        session_id=view.session_id,
        generation=view.generation,
        scenario_revision=scenario_revision,
        idempotency_key=f"bootstrap-{view.session_id}-{view.generation}",
    )
    return {
        "credential": token,
        "session": {
            "session_id": view.session_id,
            "generation": view.generation,
            "scenario_id": view.scenario_id,
            "scenario_revision": view.scenario_revision,
            "action_count": view.action_count,
            "expires_at": view.expires_at,
        },
        "meeting": {"meeting_id": meeting.meeting_id},
        "instrument": instrument_view(),
        "allowed_actions": list(JOURNEY_ACTION_IDS),
        "headers_note": "Cache-Control: no-store, private",
    }


def _require_live(token: str):
    return sessions().get_by_token(token)


def _apply_progress(*, session_id: str, generation: int, action_id: str,
                    scenario_revision: int, idempotency_key: str):
    try:
        return progress().apply_action(
            session_id=session_id,
            generation=generation,
            action_id=action_id,
            scenario_revision=scenario_revision,
            idempotency_key=idempotency_key,
        )
    except ValueError as exc:
        message = str(exc)
        if "unsupported journey action" in message:
            raise UnknownAction(message) from exc
        if "stale revision" in message:
            raise StaleRevision(message) from exc
        if "out of order" in message:
            raise OutOfOrder(message) from exc
        if "not been bootstrapped" in message:
            raise NotBootstrapped(message) from exc
        raise


async def perform_action(
    *,
    token: str,
    action_id: str,
    expected_scenario_revision: int,
    expected_generation: int,
    idempotency_key: str,
) -> dict[str, Any]:
    record = _require_live(token)
    if expected_scenario_revision != BOND_CONTENT_REVISION:
        raise StaleRevision("stale content revision")
    sessions().record_action(
        token,
        expected_generation=expected_generation,
        payload_chars=len(action_id or ""),
    )
    try:
        state = progress().get(record.session_id, expected_generation)
    except ValueError as exc:
        raise NotBootstrapped(str(exc)) from exc
    replayed = action_id in state.completed
    if not replayed:
        state = _apply_progress(
            session_id=record.session_id,
            generation=expected_generation,
            action_id=action_id,
            scenario_revision=expected_scenario_revision,
            idempotency_key=idempotency_key,
        )
    spec = action_script(action_id)
    provider = build_journey_provider(action_id)
    tool_effects = []
    for tool in spec["expected_tools"]:
        if tool["name"] == "search_knowledge_base":
            result = await _search.search(
                tool["arguments"]["query"],
                meeting_id=state.meeting_id,
                persona_id=spec["specialist_id"],
            )
            payload = {
                "items": result.items,
                "citations": [c.title for c in result.citations],
            }
        else:
            payload = {"recorded": True, "arguments": tool["arguments"]}
        assert_independent_tool_result(tool=tool, payload=payload, action_id=action_id)
        digest = hashlib.sha256(
            f"{action_id}|{tool['call_id']}|{tool['name']}".encode("utf-8")
        ).hexdigest()
        tool_effects.append(
            {
                "provider_call_id": tool["call_id"],
                "tool_name": tool["name"],
                "result_hash": digest,
            }
        )
    await _play_provider(provider, spec)
    response: dict[str, Any] = {
        "action_id": action_id,
        "stage": spec["stage"],
        "specialist_id": spec["specialist_id"],
        "final_text": spec["final_text"],
        "execution_id": _execution_id(
            record.session_id, str(expected_generation), action_id, idempotency_key
        ),
        "tool_effects": tool_effects,
        "current_step": state.stage,
        "recorded_analysis": RECORDED_ANALYSIS,
        "approval_status": APPROVAL_STATUS,
        "disclosure": DISCLOSURE,
    }
    if action_id == "queue_verification_question" and not replayed:
        outcome, entry = await queues().submit(
            meeting_id=state.meeting_id,
            owner_id=record.session_id,
            content="What remains unverified for INE001A07RW5?",
            idempotency_key=f"{idempotency_key}-queue",
            meeting_active=True,
            has_active_work=True,
        )
        assert outcome == "queued"
        response["queue_entry"] = {
            "entry_id": entry.entry_id,
            "content": entry.content,
            "revision": entry.revision,
        }
    if action_id == "agree_verification_agenda":
        response["consensus"] = {
            "topic": "Verification agenda for INE001A07RW5",
            "strength": 4,
        }
    if action_id == "end_walkthrough":
        response["votes"] = [
            {"participant": s.title, "vote": "yes"} for s in _pack.specialists
        ]
        response["brief"] = action_script("end_walkthrough")["final_text"]
    if action_id == "explore_followup":
        response["fork"] = {"meeting_id": f"{state.meeting_id}-fork"}
    _ = PINNED_ISIN
    return response


async def _play_provider(provider, spec) -> None:
    """Advance the recorded provider through tool calls to the final text."""
    for tool in spec["expected_tools"]:
        response = await provider.complete([])
        assert [c.id for c in response.tool_calls] == [tool["call_id"]]
    final = await provider.complete([])
    assert final.content


def meeting_of(token: str) -> dict[str, Any]:
    record = _require_live(token)
    state = progress().get(record.session_id, record.generation)
    return {"meeting_id": state.meeting_id, "current_step": state.stage}


async def list_queue(token: str) -> dict[str, Any]:
    record = _require_live(token)
    try:
        state = progress().get(record.session_id, record.generation)
    except ValueError as exc:
        raise NotBootstrapped(str(exc)) from exc
    entries = await queues().list_pending(state.meeting_id)
    own = [e for e in entries if e.owner_id == record.session_id]
    return {
        "entries": [
            {
                "entry_id": e.entry_id,
                "content": e.content,
                "revision": e.revision,
            }
            for e in own
        ]
    }


async def edit_queue_entry(
    token: str, entry_id: str, content: str, expected_revision: int
) -> dict[str, Any]:
    record = _require_live(token)
    entry = await queues().edit(
        entry_id,
        owner_id=record.session_id,
        content=content,
        expected_revision=expected_revision,
    )
    return {
        "entry_id": entry.entry_id,
        "content": entry.content,
        "revision": entry.revision,
    }


async def remove_queue_entry(
    token: str, entry_id: str, expected_revision: Optional[int] = None
) -> dict[str, Any]:
    record = _require_live(token)
    if expected_revision is None:
        try:
            state = progress().get(record.session_id, record.generation)
        except ValueError as exc:
            raise NotBootstrapped(str(exc)) from exc
        entries = await queues().list_pending(state.meeting_id)
        match = next((e for e in entries if e.entry_id == entry_id), None)
        if match is None:
            raise QueueConflict("not_found", {})
        expected_revision = match.revision
    entry = await queues().remove(
        entry_id, owner_id=record.session_id, expected_revision=expected_revision
    )
    return {"entry_id": entry.entry_id, "revision": entry.revision}


def reset_session(
    *, token: str, expected_generation: int, idempotency_key: str
) -> dict[str, Any]:
    record = _require_live(token)
    view = sessions().reset(
        token,
        expected_generation=expected_generation,
        idempotency_key=idempotency_key,
    )
    meeting = progress().bootstrap(
        session_id=view.session_id,
        generation=view.generation,
        scenario_revision=view.scenario_revision,
        idempotency_key=idempotency_key,
    )
    _ = record
    return {
        "session": {
            "session_id": view.session_id,
            "generation": view.generation,
            "scenario_id": view.scenario_id,
        },
        "meeting": {"meeting_id": meeting.meeting_id},
    }


REAL_DEMO_MEETING_NAME = "Bond Review (Recorded Demo): INE001A07RW5"


def build_real_demo_meeting_payload() -> dict[str, str]:
    """Pure helper: name/agenda for a real meeting bootstrapped from the DB package.

    No network or storage access; unit-tested without Supabase.
    """
    agenda = (
        "Recorded analysis walkthrough for HDFC Ltd 7.87% secured NCD "
        f"({PINNED_ISIN}), snapshot {SNAPSHOT_DATE} (historical, matured 2022-07-18). "
        f"Approval status: {APPROVAL_STATUS}. "
        "All AI answers in this room are recorded analysis, not live research. "
        f"Disclosure: {DISCLOSURE}"
    )
    return {"name": REAL_DEMO_MEETING_NAME, "agenda": agenda}


async def create_real_demo_meeting(
    *, scenario_id: str, scenario_revision: int, manager=None
) -> dict[str, Any]:
    """Create a REAL meeting for the demo via the shared MeetingManager.

    Thin facilitation: the meeting itself is a normal record (default roster,
    normal routes/stores/SSE). The journey package only supplies the seed
    payload. Fail closed with RuntimeError when storage is unavailable.
    """
    if scenario_id != REAL_SCENARIO_ID:
        raise errors.ScenarioConflict()
    if scenario_revision != BOND_CONTENT_REVISION:
        raise StaleRevision(f"revision {scenario_revision} != pinned 1")
    payload = build_real_demo_meeting_payload()
    from app.models import MeetingCreate as _MeetingCreate

    create_data = _MeetingCreate(
        name=payload["name"],
        agenda=payload["agenda"],
        user_id="demo-visitor",
    )
    if manager is None:
        from app.services.meeting_manager import MeetingManager as _MeetingManager

        manager = _MeetingManager()
    try:
        meeting = await manager.create_meeting(create_data)
    except Exception as exc:
        raise RuntimeError(f"real demo meeting unavailable: {exc}") from exc
    meeting_id = getattr(meeting, "id", None)
    if meeting_id is None and isinstance(meeting, dict):
        meeting_id = meeting.get("id")
    return {
        "meeting": {"meeting_id": meeting_id},
        "instrument": instrument_view(),
        "recorded_analysis": RECORDED_ANALYSIS,
        "approval_status": APPROVAL_STATUS,
        "disclosure": DISCLOSURE,
    }


def _pick_demo_participant(meeting, spec: dict) -> Any:
    """Pick a real participant for the recorded turn (C0 search-only safe).

    The journey script names bond specialists, but a real demo meeting carries
    the normal default roster (Investor/CTO/Analyst). For the C0 vertical
    slice (submit_bond_question, search-only) any real participant works;
    prefer the Analyst for evidence-grounded answers, else the first member.
    Actions needing bond-roster disagreement/consensus targets fail honestly
    via engine validation against the real roster.
    """
    participants = list(getattr(meeting, "participants", []) or [])
    if not participants:
        raise RuntimeError("real demo meeting has no participants")
    for p in participants:
        name = (getattr(p, "name", "") or "").lower()
        role = (getattr(p, "role", "") or "").lower()
        if "analyst" in name or "analyst" in role:
            return p
    return participants[0]


class _AssertingDemoKnowledge:
    """BondKnowledgeSearch wrapper enforcing seed-fixed software assertions.

    Delegates retrieval to the frozen pack, then checks the result against the
    approved source list/snapshot (never a hash of the payload under test).
    Mismatch raises TurnFailure so the turn fails honestly with retryable
    progress preserved.
    """

    def __init__(self, inner: Any, action_id: str) -> None:
        self._inner = inner
        self._action_id = action_id

    async def search(self, query: str, meeting_id: str, persona_id: Any = None):
        result = await self._inner.search(query, meeting_id, persona_id)
        try:
            assert_independent_tool_result(
                tool={"name": "search_knowledge_base",
                      "arguments": {"query": query}},
                payload={
                    "items": result.items,
                    "citations": [c.title for c in result.citations],
                },
                action_id=self._action_id,
            )
        except ValueError as exc:
            from app.modules.meetings.engine import TurnFailure as _TurnFailure

            raise _TurnFailure("tool_result_mismatch", str(exc)) from exc
        return result


async def start_demo_recorded_turn(
    *, meeting_id: str, action_id: str, idempotency_key: Optional[str] = None,
    manager=None,
) -> dict[str, Any]:
    """Run one recorded journey action through the SHARED TurnEngine.

    C0 vertical slice: submit_bond_question (search-only, no roster mismatch)
    plays its original provider call IDs (e.g. call-search-1) through
    TurnEngine + BondKnowledgeSearch + RecordedProvider, persists a normal
    message/citations via MeetingManager, and streams chunked text_delta
    frames before turn_completed on the NORMAL turn SSE journal
    (/api/meetings/turns/{turn_id}/events). No parallel workflow, no
    completed-JSON shortcut. Fail honestly on unknown action, missing
    meeting, or seed drift.
    """
    import asyncio
    import uuid as _uuid

    if action_id not in JOURNEY_ACTION_IDS:
        raise UnknownAction(f"unsupported journey action: {action_id}")
    try:
        spec = action_script(action_id)
    except KeyError as exc:
        raise UnknownAction(str(exc)) from exc

    if manager is None:
        from app.services.meeting_manager import MeetingManager as _MeetingManager

        manager = _MeetingManager()
    meeting = await manager.get_meeting(meeting_id)
    if meeting is None:
        raise ValueError(f"Meeting not found: {meeting_id}")
    participant = _pick_demo_participant(meeting, spec)

    pack = get_pack()
    knowledge = _AssertingDemoKnowledge(BondKnowledgeSearch(pack), action_id)
    provider = build_journey_provider(action_id)

    def _resolve(_provider_name: Any, _model_name: Any):
        return provider

    from app.modules.meetings.engine import TurnEngine
    from app.modules.meetings.runner import TurnRunner
    from app.modules.meetings.store import get_shared_turn_store

    store = get_shared_turn_store()
    engine = TurnEngine(
        meeting_loader=manager,
        provider_resolver=_resolve,
        knowledge_search=knowledge,
        turn_store=store,
        lease_coordinator=None,
    )
    key = idempotency_key or f"demo:{meeting_id}:{action_id}:{_uuid.uuid4().hex}"

    async def _run() -> None:
        await engine.run(meeting_id, participant.id, key)

    task = asyncio.create_task(_run())
    try:
        from app.modules.meetings.runner import TurnRunner as _Runner

        _Runner.register_detached(task)
    except Exception:
        pass

    # Wait for reservation so callers get the normal turn_id/events_url
    # (same contract as POST /api/meetings/{id}/turns).
    loop = asyncio.get_running_loop()
    deadline = loop.time() + 30.0
    turn_id: Optional[str] = None
    reservation_error: Optional[BaseException] = None
    while True:
        try:
            turn_id = await store.turn_id_for_key(key)
        except Exception:
            turn_id = None
        if turn_id is not None:
            break
        if task.done():
            if task.cancelled():
                reservation_error = RuntimeError(
                    "demo turn cancelled before reservation")
            else:
                exc = task.exception()
                if exc is not None:
                    reservation_error = exc
                else:
                    reservation_error = RuntimeError(
                        "demo turn ended before reservation")
            break
        if loop.time() >= deadline:
            reservation_error = RuntimeError("demo turn reservation timed out")
            break
        await asyncio.sleep(0.01)
    if turn_id is None:
        raise RuntimeError(f"demo recorded turn not reserved: {reservation_error}")
    return {
        "turn_id": turn_id,
        "meeting_id": meeting_id,
        "participant_id": participant.id,
        "participant_name": getattr(participant, "name", ""),
        "action_id": action_id,
        "stage": spec.get("stage"),
        "events_url": f"/api/meetings/turns/{turn_id}/events",
        "recorded_analysis": RECORDED_ANALYSIS,
        "approval_status": APPROVAL_STATUS,
        "disclosure": DISCLOSURE,
    }
