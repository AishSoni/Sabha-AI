"""Durable turn retrieval goes through the Knowledge public interface."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.modules.knowledge.application.retrieval import RetrievedPassage
from app.services.turn_queue import TurnClaim, TurnQueueService


class FakeLifecycle:
    def __init__(self) -> None:
        self.requests = []
        self.attached = []
        self.fail_attach = False
        self.revalidated = []
        self.allowed = None

    async def search(self, request):
        self.requests.append(request)
        return [
            RetrievedPassage(
                text="The market grew 20%.",
                score=0.91,
                document_id=uuid.uuid4(),
                revision_id=uuid.uuid4(),
                chunk_id=uuid.uuid4(),
                chunk_index=0,
                content_sha256="a" * 64,
                file_name="market.pdf",
            )
        ]

    async def attach_evidence_message(self, operation_id, tool_call_id, message_id):
        if self.fail_attach:
            raise RuntimeError("evidence store unavailable")
        self.attached.append((operation_id, tool_call_id, message_id))
        return 1

    async def revalidate_revisions(self, revision_ids, *, meeting_id, stack_ids):
        self.revalidated.append((set(revision_ids), meeting_id, list(stack_ids)))
        if self.allowed is None:
            return set(revision_ids)
        return set(self.allowed)


@pytest.fixture
def knowledge(monkeypatch):
    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        "app.modules.knowledge.public.get_knowledge_lifecycle", lambda: lifecycle
    )
    return lifecycle


def _service() -> TurnQueueService:
    service = TurnQueueService.__new__(TurnQueueService)
    service.vector_store_factory = None
    return service


def _claim(meeting_id=None, operation_id=None) -> TurnClaim:
    return TurnClaim(
        operation={},
        operation_id=str(operation_id or uuid.uuid4()),
        meeting_id=str(meeting_id or uuid.uuid4()),
        participant_id=str(uuid.uuid4()),
        fence=1,
        context_boundary=0,
    )


async def test_durable_search_uses_meeting_and_fixed_stack_scope(knowledge):
    meeting_id = uuid.uuid4()
    stack_id = uuid.uuid4()
    operation_id = uuid.uuid4()
    participant = SimpleNamespace(
        id=str(uuid.uuid4()), name="The Analyst", stack_ids=[str(stack_id)]
    )
    tool_call = SimpleNamespace(id="call-1")

    text, is_error = await _service()._durable_knowledge_search(
        participant, "market size", _claim(meeting_id, operation_id), tool_call
    )

    assert is_error is False
    assert "market.pdf" in text
    request = knowledge.requests[0]
    assert request.query == "market size"
    assert request.scope.meeting_id == meeting_id
    assert request.scope.stack_ids == [stack_id]
    assert request.identity.operation_id == operation_id
    assert request.identity.participant_id == uuid.UUID(participant.id)
    assert request.identity.tool_call_id == "call-1"
    assert request.identity.message_id is None


async def test_attach_links_only_knowledge_tool_calls(knowledge):
    claim = _claim()
    message_id = uuid.uuid4()
    calls = [
        {"tool": "search_knowledge_base", "call_id": "call-1", "result": "x"},
        {"tool": "log_consensus", "call_id": "call-2", "result": "y"},
        {"tool": "search_knowledge_base", "call_id": "call-3", "result": "z"},
    ]

    await _service()._attach_knowledge_evidence(claim, calls, str(message_id))

    assert knowledge.attached == [
        (uuid.UUID(claim.operation_id), "call-1", message_id),
        (uuid.UUID(claim.operation_id), "call-3", message_id),
    ]


async def test_attach_failure_does_not_fail_the_turn(knowledge):
    knowledge.fail_attach = True

    await _service()._attach_knowledge_evidence(
        _claim(),
        [{"tool": "search_knowledge_base", "call_id": "call-1", "result": "x"}],
        str(uuid.uuid4()),
    )


async def test_dispatch_guard_rejects_a_revoked_revision(knowledge):
    revision_id = uuid.uuid4()
    claim = _claim()
    participant = SimpleNamespace(id=str(uuid.uuid4()), stack_ids=[])
    knowledge.allowed = set()

    allowed = await _service()._knowledge_still_eligible(
        claim, participant, {revision_id}
    )

    assert allowed is False
    assert knowledge.revalidated[0][0] == {revision_id}


async def test_dispatch_guard_accepts_a_live_revision(knowledge):
    revision_id = uuid.uuid4()
    knowledge.allowed = {revision_id}

    assert await _service()._knowledge_still_eligible(
        _claim(), SimpleNamespace(id=str(uuid.uuid4()), stack_ids=[]), {revision_id}
    ) is True
