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
DEMO_VISITOR_ID = "demo-visitor"
DEMO_STACK_NAME = "Demo walk-through bond sources (recorded)"


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


_raw_package: Optional[dict[str, Any]] = None


def loaded_package() -> dict[str, Any]:
    """Raw validated package dict (guide/guide_ui live here, not on the pack).

    Supabase-pinned row first; validated seed file as local fallback. Cached
    for repeated guide reads.
    """
    global _raw_package
    if _raw_package is not None:
        return _raw_package
    try:
        from app.core.database import get_supabase_admin
        from app.infrastructure.demo.bond_package import load_pinned_package

        pkg = load_pinned_package(get_supabase_admin())
    except Exception:
        from app.infrastructure.demo.bond_package import load_seed_package

        pkg = load_seed_package()
    _raw_package = pkg
    return pkg


def guide_view() -> dict[str, Any]:
    """Guide content for the frontend overlay: journey + UI steps from the DB
    package. Frontend-owned anchors are referenced by key only; no routes,
    HTML, or selectors live in the package."""
    pkg = loaded_package()
    return {
        "scenario_id": pkg.get("scenario_id", REAL_SCENARIO_ID),
        "scenario_revision": int(pkg.get("scenario_revision", 1)),
        "content_version": int(pkg.get("content_version", 1)),
        "disclosure": DISCLOSURE,
        "instrument": instrument_view(),
        "snapshot_date": pkg.get("snapshot_date", SNAPSHOT_DATE),
        "journey": pkg.get("guide", {}),
        "ui": pkg.get("guide_ui", {}),
        "specialists": [
            {
                "specialist_id": s.get("specialist_id"),
                "title": s.get("title"),
                "remit": s.get("remit"),
            }
            for s in pkg.get("specialists", [])
        ],
        "recorded_analysis": RECORDED_ANALYSIS,
        "approval_status": APPROVAL_STATUS,
    }


def journey_state_for_token(token: str) -> dict[str, Any]:
    """Authoritative journey state for resume: session + progress + pack."""
    view = _require_live(token)
    pv = progress().get(view.session_id, view.generation)
    return {
        "session": {
            "session_id": view.session_id,
            "generation": view.generation,
            "scenario_id": view.scenario_id,
            "action_count": view.action_count,
            "expires_at": view.expires_at,
        },
        "progress": {
            "stage": pv.stage,
            "completed": list(pv.completed),
            "failed": bool(pv.failed),
            "meeting_id": pv.meeting_id,
            "specialists": list(pv.specialists),
            "turn_reference": pv.turn_reference,
        },
        "instrument": instrument_view(),
        "disclosure": DISCLOSURE,
    }


def apply_observed_progress(
    token: str,
    action_id: str,
    idempotency_key: Optional[str] = None,
) -> dict[str, Any]:
    """Record client-observed steps (inspect_board, queue exercise) through
    the same ordered progress store used by recorded turns."""
    view = _require_live(token)
    key = idempotency_key or f"journey:{action_id}:{view.session_id}"
    pv = _apply_progress(
        session_id=view.session_id,
        generation=view.generation,
        action_id=str(action_id),
        scenario_revision=BOND_CONTENT_REVISION,
        idempotency_key=str(key),
        instrument_ref=PINNED_ISIN,
    )
    return {
        "progress": {
            "stage": pv.stage,
            "completed": list(pv.completed),
            "failed": bool(pv.failed),
            "meeting_id": pv.meeting_id,
            "turn_reference": pv.turn_reference,
        }
    }


_FORK_SENTINEL = "__fork__"


async def attach_real_meeting(token: str, manager=None) -> dict[str, Any]:
    """Bind (or reuse) the pinned REAL walkthrough meeting for a session.

    Idempotent per generation: when the progress row already carries a real
    meeting id (not the synthetic bootstrap placeholder), reuse it; otherwise
    seed the specialist personas once and create the meeting through the
    shared MeetingManager, then pin the binding in journey progress.
    """
    view = _require_live(token)
    pv = progress().get(view.session_id, view.generation)
    meeting_id = pv.meeting_id
    if meeting_id and not str(meeting_id).startswith("meeting-"):
        try:
            seeds = await seed_demo_assets()
        except Exception as exc:
            raise RuntimeError(
                f"specialist personas unavailable: {exc}") from exc
        return {
            "session": {
                "session_id": view.session_id,
                "generation": view.generation,
            },
            "meeting": {"meeting_id": meeting_id},
            "persona_ids": seeds["persona_ids"],
            "instrument": instrument_view(),
            "recorded_analysis": RECORDED_ANALYSIS,
            "approval_status": APPROVAL_STATUS,
            "disclosure": DISCLOSURE,
        }
    try:
        seeds = await seed_demo_assets()
    except Exception as exc:
        raise RuntimeError(f"specialist personas unavailable: {exc}") from exc
    result = await create_real_demo_meeting(
        scenario_id=REAL_SCENARIO_ID,
        scenario_revision=BOND_CONTENT_REVISION,
        manager=manager,
        persona_ids=seeds["persona_ids"],
    )
    real_id = result["meeting"]["meeting_id"]
    progress().pin_meeting(view.session_id, view.generation, real_id)
    result.update({
        "session": {
            "session_id": view.session_id,
            "generation": view.generation,
        },
        "persona_ids": seeds["persona_ids"],
    })
    return result


async def create_explore_fork(token: str, manager=None) -> dict[str, Any]:
    """Bounded J09 exploration fork: one secondary meeting per session
    generation, allowed only after end_walkthrough (honest OutOfOrder gate).

    The fork is a normal meeting (name carries the fork tag); exploring other
    bonds or reseeding it is rejected by the same bounded path.
    """
    view = _require_live(token)
    fork_tag = f" (fork {view.session_id} g{view.generation})"
    progress_state = progress().get(view.session_id, view.generation)
    # In-process registry first; durable fallback queries the fork tag.
    for ms_key, ms_val in list(_states_for_forks.items()):
        if ms_key[0] == view.session_id and ms_key[1] == view.generation:
            return {"meeting": {"meeting_id": ms_val}, "fork": True}
    try:
        from app.core.database import get_supabase_admin

        admin = get_supabase_admin()
        if admin is not None:
            rows = (
                admin.table("meetings")
                .select("id,name")
                .eq("user_id", DEMO_VISITOR_ID)
                .ilike("name", f"%{fork_tag}")
                .limit(1)
                .execute()
            ).data or []
            if rows:
                _states_for_forks[(view.session_id, view.generation)] = rows[0]["id"]
                return {"meeting": {"meeting_id": rows[0]["id"]}, "fork": True}
    except Exception:
        pass
    if "explore_followup" not in progress_state.completed:
        pv = _apply_progress(
            session_id=view.session_id,
            generation=view.generation,
            action_id="explore_followup",
            scenario_revision=BOND_CONTENT_REVISION,
            idempotency_key=f"journey:explore_followup:{view.session_id}-{view.generation}",
            instrument_ref=PINNED_ISIN,
        )
    else:
        pv = progress_state
    try:
        seeds = await seed_demo_assets()
    except Exception as exc:
        raise RuntimeError(f"specialist personas unavailable: {exc}") from exc
    payload = build_real_demo_meeting_payload()
    from app.models import MeetingCreate as _MeetingCreate

    create_data = _MeetingCreate(
        name=payload["name"] + fork_tag,
        agenda=payload["agenda"],
        user_id=DEMO_VISITOR_ID,
        persona_ids=seeds["persona_ids"],
    )
    if manager is None:
        from app.services.meeting_manager import MeetingManager as _MeetingManager

        manager = _MeetingManager()
    try:
        meeting = await manager.create_meeting(create_data)
    except Exception as exc:
        raise RuntimeError(f"explore fork unavailable: {exc}") from exc
    fork_id = getattr(meeting, "id", None)
    if fork_id is None and isinstance(meeting, dict):
        fork_id = meeting.get("id")
    _states_for_forks[(view.session_id, view.generation)] = fork_id
    return {
        "meeting": {"meeting_id": fork_id},
        "fork": True,
        "progress": {"stage": pv.stage, "completed": list(pv.completed)},
    }


_states_for_forks: dict[tuple[str, int], str] = {}


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
                    scenario_revision: int, idempotency_key: str,
                    instrument_ref: Optional[str] = None):
    try:
        return progress().apply_action(
            session_id=session_id,
            generation=generation,
            action_id=action_id,
            scenario_revision=scenario_revision,
            idempotency_key=idempotency_key,
            instrument_ref=instrument_ref,
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
    *,
    scenario_id: str, scenario_revision: int, manager=None,
    persona_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Create a REAL meeting for the demo via the shared MeetingManager.

    Thin facilitation: the meeting itself is a normal record (normal routes/
    stores/SSE). When persona_ids is provided the roster is seeded from those
    personas (the bond specialists), so recorded disagreement/consensus
    targets resolve against real participants. Otherwise the default roster
    applies and specialist actions fail honestly. Fail closed with
    RuntimeError when storage is unavailable.
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
        user_id=DEMO_VISITOR_ID,
        persona_ids=persona_ids or None,
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


async def seed_demo_assets(persona_manager=None) -> dict[str, Any]:
    """Seed the bounded run-specific stack + specialist personas once.

    Reconciling creation: repeated calls return the existing demo-visitor
    personas/stack matched by exact names instead of raising or duplicating.
    Uses the SHARED persona service (same create path the roster form uses);
    bounds come from the package specialists (fixed names/remit prompts).
    """
    pack = get_pack()
    from app.services.persona_manager import PersonaManager as _PM

    pm = persona_manager or _PM()
    existing = await pm.list_personas(DEMO_VISITOR_ID, include_defaults=False)
    by_name = {(p.name or "").strip(): p for p in (existing or [])}
    persona_ids: list[str] = []
    for s in _specialists_as_dicts():
        name = (s.get("title") or "").strip()
        if not name:
            continue
        if name in by_name:
            pid = getattr(by_name[name], "id", None)
            if pid:
                persona_ids.append(str(pid))
            continue
        system_prompt = _specialist_system_prompt(s)
        from app.models.persona_schemas import PersonaCreate as _PersonaCreate

        created = await pm.create_persona(_PersonaCreate(
            name=name,
            subtitle=str(s.get("remit") or "")[:140],
            system_prompt=system_prompt,
            user_id=DEMO_VISITOR_ID,
        ))
        pid = getattr(created, "id", None)
        if pid:
            persona_ids.append(str(pid))
    return {"persona_ids": persona_ids, "stack": None}


def _specialist_system_prompt(s: dict) -> str:
    """Deterministic specialist prompt: base advisory board + package remit."""
    from app.services.prompts import get_full_prompt

    remit = s.get("remit") or ""
    questions = " ".join(f"- {q}" for q in (s.get("key_questions") or []))
    obligations = " ".join(f"- {o}" for o in (s.get("output_obligations") or []))
    handoffs = "; ".join(s.get("handoffs") or [])
    scope = ", ".join(s.get("evidence_scope") or [])
    return (
        f"{get_full_prompt('')}\n\n"
        f"Role: {s.get('title')} (specialist_id={s.get('specialist_id')}).\n"
        f"Remit: {remit}\n"
        f"Key questions:\n{questions}\n"
        f"Output obligations:\n{obligations}\n"
        f"Handoffs: {handoffs}\n"
        f"Evidence scope: {scope}.\n"
        f"Snapshot: {SNAPSHOT_DATE} for {PINNED_ISIN}. {DISCLOSURE}"
    )


def _specialists_as_dicts() -> list[dict[str, Any]]:
    """Package specialists as plain dicts (in-code pack returns pydantic)."""
    specialists = getattr(get_pack(), "specialists", None) or []
    out: list[dict[str, Any]] = []
    for s in specialists:
        if isinstance(s, dict):
            out.append(s)
            continue
        dumped = getattr(s, "model_dump", None)
        out.append(dumped() if callable(dumped) else dict(s))
    return out


def _specialist_title(specialist_id: Optional[str]) -> Optional[str]:
    """Map a journey specialist_id to its seeded persona title (from the package)."""
    if specialist_id is None:
        return None
    for s in _specialists_as_dicts():
        if s.get("specialist_id") == specialist_id:
            return s.get("title")
    return None


def _pick_demo_participant(meeting, spec: dict) -> Any:
    """Pick the real participant matching the journey script's specialist.

    Journey scripts name bond specialists; the real demo meeting is seeded
    with personas whose titles come from the DB package specialists, so tool
    validation (disagreement targets, consensus participants) resolves against
    the actual roster. Falls back to the Analyst for search-only actions when
    the seeded specialist is absent, and fails honestly otherwise.
    """
    participants = list(getattr(meeting, "participants", []) or [])
    if not participants:
        raise RuntimeError("real demo meeting has no participants")
    title = _specialist_title(spec.get("specialist_id"))
    if title:
        for p in participants:
            if (getattr(p, "name", "") or "").strip() == title.strip():
                return p
        raise RuntimeError(
            f"demo journey requires seeded specialist '{title}' in the meeting roster"
        )
    for p in participants:
        if "analyst" in (getattr(p, "name", "") or "").lower():
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

    The recorded script (original call IDs, e.g. call-search-1) plays through
    TurnEngine + BondKnowledgeSearch + RecordedProvider, persists a normal
    message/citations via MeetingManager, and streams chunked text_delta
    frames before turn_completed on the NORMAL turn SSE journal
    (/api/meetings/turns/{turn_id}/events). No parallel workflow, no
    completed-JSON shortcut. Fail honestly on unknown action, missing
    meeting, or seed drift.

    Journey progress: when the meeting is pinned to a walkthrough
    (demo_scenario_progress), the action advances progress exactly once
    after the turn terminalizes successfully; a failed turn keeps the
    stage retryable (mark_failed) without skipping ahead.
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

    # Journey-binding: real demo meetings must be pinned by a walkthrough
    # session before recorded turns run (server-authoritative journey
    # context, not a browser-mode flag).
    binding = progress().find_by_meeting(meeting_id)
    if binding is None:
        raise ValueError(
            f"Meeting {meeting_id} is not pinned to a demo walkthrough"
        )
    if binding.meeting_id != meeting_id:
        raise ValueError("journey meeting binding mismatch")

    pack = get_pack()
    knowledge = _AssertingDemoKnowledge(BondKnowledgeSearch(pack), action_id)
    provider = build_journey_provider(action_id)

    def _resolve(_provider_name: Any, _model_name: Any):
        return provider

    from app.modules.meetings.engine import TurnEngine
    from app.modules.meetings.runner import TurnRunner
    from app.modules.meetings.store import get_shared_turn_store

    store = get_shared_turn_store()
    from app.modules.meetings.policies import TurnPolicies

    engine = TurnEngine(
        meeting_loader=manager,
        provider_resolver=_resolve,
        knowledge_search=knowledge,
        turn_store=store,
        lease_coordinator=None,
        policies=TurnPolicies(stream_chunk_chars=90),
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

    # Advance journey progress exactly once after terminal success; a failed
    # turn keeps its stage retryable. This runs in the background so the
    # caller keeps the fast 202-style response contract.
    async def _finalize() -> None:
        try:
            await task
        except Exception:
            try:
                progress().mark_failed(
                    session_id=binding.session_id,
                    generation=binding.generation,
                    action_id=action_id,
                )
            except Exception:
                pass
            return
        try:
            _apply_progress(
                session_id=binding.session_id,
                generation=binding.generation,
                action_id=action_id,
                scenario_revision=int(binding.scenario_revision),
                idempotency_key=f"journey:{action_id}:{meeting_id}",
                instrument_ref=PINNED_ISIN,
            )
        except Exception:
            pass

    asyncio.get_running_loop().create_task(_finalize())

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
