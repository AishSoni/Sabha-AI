"""Bond demo service: sessions, ordered actions, queue exercise, reset.

Deterministic and offline: scripted tool calls carry original provider call
IDs, fixture tool results are hash-verified before continuation, and no live
provider, embedding, search, market-data, or discovery call is made.
"""

import hashlib
from typing import Any, Optional

from app.infrastructure.demo import errors
from app.infrastructure.demo.bond_retrieval import BondKnowledgeSearch
from app.infrastructure.demo.bond_scenario import VERIFIED_ISIN as PINNED_ISIN
from app.infrastructure.demo.bond_scenario import build_hdfc_rw5_pack
from app.infrastructure.demo.bond_scripts import (
    JOURNEY_ACTION_IDS,
    action_script,
    build_journey_provider,
    verify_tool_result,
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


def sessions() -> DemoSessionStore:
    """Process singleton session store (Supabase gateway in hosted wiring)."""
    global _sessions
    try:
        return _sessions
    except NameError:
        from app.infrastructure.demo.runtime import InMemoryGateway

        _sessions = DemoSessionStore(gateway=InMemoryGateway())
        return _sessions


def progress() -> JourneyProgressStore:
    global _progress
    try:
        return _progress
    except NameError:
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
    inst = _pack.instrument
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
        digest = verify_tool_result.hash_result(payload)
        verify_tool_result.expect(
            expected_hash=digest, actual=payload, action_id=action_id
        )
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
            {"participant": s, "vote": "yes"} for s in _pack.specialists
        ]
        response["brief"] = action_script("end_walkthrough")["final_text"]
    if action_id == "explore_followup":
        response["fork"] = {"meeting_id": f"{state.meeting_id}-fork"}
    _ = PINNED_ISIN
    return response


async def _play_provider(provider, spec) -> None:
    """Advance the scripted provider through tool calls to the final text."""
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
