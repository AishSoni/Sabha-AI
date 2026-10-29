"""Live knowledge citations keep the exact retained revision identity.

A live citation is built only from the server-validated retrieval passages,
streamed after the tool result, and persisted on the final message. Model
output never chooses the document or revision.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.capabilities.inference.contracts import StreamEvent, StreamEventType
from app.modules.knowledge.application.retrieval import RetrievedPassage
from app.modules.meetings.infrastructure.turns import TurnClaim, TurnQueueService
from tests.doubles.providers import ScriptedProvider


DOCUMENT_ID = uuid.uuid4()
REVISION_ID = uuid.uuid4()
CHUNK_ID = uuid.uuid4()
OTHER_CHUNK_ID = uuid.uuid4()


class FakeLifecycle:
    async def search(self, request):
        return [
            RetrievedPassage(
                text="The issuer's leverage improved to 2.1x.",
                score=0.93,
                document_id=DOCUMENT_ID,
                revision_id=REVISION_ID,
                chunk_id=CHUNK_ID,
                chunk_index=3,
                content_sha256="a" * 64,
                file_name="credit-note.md",
                page_number=7,
            ),
            # A duplicate passage for the same chunk must not create a second
            # citation or a second streamed event.
            RetrievedPassage(
                text="The issuer's leverage improved to 2.1x.",
                score=0.90,
                document_id=DOCUMENT_ID,
                revision_id=REVISION_ID,
                chunk_id=CHUNK_ID,
                chunk_index=3,
                content_sha256="a" * 64,
                file_name="credit-note.md",
                page_number=7,
            ),
            RetrievedPassage(
                text="Revenue concentration remains the key risk.",
                score=0.81,
                document_id=DOCUMENT_ID,
                revision_id=REVISION_ID,
                chunk_id=OTHER_CHUNK_ID,
                chunk_index=4,
                content_sha256="b" * 64,
                file_name="credit-note.md",
                page_number=8,
            ),
        ]


@pytest.fixture
def knowledge(monkeypatch):
    lifecycle = FakeLifecycle()
    monkeypatch.setattr(
        "app.modules.knowledge.public.get_knowledge_lifecycle", lambda: lifecycle
    )
    return lifecycle


class RecordingTurnService(TurnQueueService):
    def __init__(self) -> None:
        self.vector_store_factory = None
        self.events: list[dict] = []
        self.publication: dict | None = None
        self.attached: list[tuple] = []

    async def _append_events(self, claim, events):
        self.events.extend(events)
        return events

    async def _current_operation(self, claim):
        return {"status": "processing"}

    async def _renew(self, claim):
        return True

    async def _knowledge_still_eligible(self, claim, participant, revisions):
        return True

    async def _begin_attempt(self, claim, provider, model):
        return ("attempt-1", 1)

    async def _complete_attempt(self, attempt_id, usage, cost):
        return None

    async def _fail_attempt(self, attempt_id, error_type, code):
        return None

    async def _publish(self, claim, message, usage, cost):
        self.publication = message
        return {"outcome": "published", "message": {"id": message["id"]}}

    async def _attach_knowledge_evidence(self, claim, tool_calls, message_id):
        self.attached.append((claim.operation_id, tool_calls, message_id))


def _claim() -> TurnClaim:
    return TurnClaim(
        operation={},
        operation_id=str(uuid.uuid4()),
        meeting_id=str(uuid.uuid4()),
        participant_id=str(uuid.uuid4()),
        fence=1,
        context_boundary=0,
    )


def _provider() -> ScriptedProvider:
    provider = ScriptedProvider()
    provider.scripts = [
        [
            StreamEvent(
                type=StreamEventType.TOOL_CALL,
                tool_name="search_knowledge_base",
                tool_arguments={"query": "leverage"},
                tool_call_id="call-1",
            ),
            StreamEvent(type=StreamEventType.DONE, usage={"total_tokens": 10}),
        ],
        [
            StreamEvent(type=StreamEventType.TEXT, content="Leverage improved."),
            StreamEvent(type=StreamEventType.DONE, usage={"total_tokens": 5}),
        ],
    ]
    return provider


async def test_live_knowledge_citations_stream_and_persist_exact_revision(knowledge):
    service = RecordingTurnService()
    claim = _claim()
    participant = SimpleNamespace(
        id=str(uuid.uuid4()), name="The Analyst", stack_ids=[]
    )

    result = await service._run_loop(
        claim=claim,
        participant=participant,
        provider=_provider(),
        gen={"provider": "scripted", "model": "scripted-1", "temperature": 0.2, "max_tokens": 256},
        effective_record={"provider": "scripted", "model": "scripted-1"},
        messages=[],
        tools=[],
    )

    assert result.status == "completed"
    citation_events = [
        event["payload"] for event in service.events if event["type"] == "citation"
    ]
    assert [event["chunk_id"] for event in citation_events] == [
        str(CHUNK_ID),
        str(OTHER_CHUNK_ID),
    ]
    assert citation_events[0]["document_id"] == str(DOCUMENT_ID)
    assert citation_events[0]["revision_id"] == str(REVISION_ID)
    assert citation_events[0]["chunk_index"] == 3
    assert citation_events[0]["page_number"] == 7
    assert citation_events[0]["title"] == "credit-note.md"
    assert citation_events[0]["source"] == "knowledge"

    assert service.publication is not None
    persisted = service.publication["citations"]
    assert [citation["chunk_id"] for citation in persisted] == [
        str(CHUNK_ID),
        str(OTHER_CHUNK_ID),
    ]
    assert persisted[0]["revision_id"] == str(REVISION_ID)
    assert persisted[0]["page_number"] == 7
    # The same message was published and its evidence linked after publish.
    assert service.attached[0][2] == service.publication["id"]


async def test_model_supplied_citation_ids_never_select_a_revision(knowledge):
    service = RecordingTurnService()
    claim = _claim()
    participant = SimpleNamespace(
        id=str(uuid.uuid4()), name="The Analyst", stack_ids=[]
    )
    provider = ScriptedProvider()
    provider.scripts = [
        [
            StreamEvent(
                type=StreamEventType.TOOL_CALL,
                tool_name="search_knowledge_base",
                tool_arguments={
                    "query": "leverage",
                    "document_id": str(uuid.uuid4()),
                    "revision_id": str(uuid.uuid4()),
                },
                tool_call_id="call-1",
            ),
            StreamEvent(type=StreamEventType.DONE, usage={}),
        ],
        [
            StreamEvent(
                type=StreamEventType.CITATION,
                source="knowledge",
                title="model-chosen.md",
                document_id=str(uuid.uuid4()),
                revision_id=str(uuid.uuid4()),
            ),
            StreamEvent(type=StreamEventType.DONE, usage={}),
        ],
    ]

    await service._run_loop(
        claim=claim,
        participant=participant,
        provider=provider,
        gen={"provider": "scripted", "model": "scripted-1", "temperature": 0.2, "max_tokens": 256},
        effective_record={"provider": "scripted", "model": "scripted-1"},
        messages=[],
        tools=[],
    )

    citation_events = [
        event["payload"] for event in service.events if event["type"] == "citation"
    ]
    # The provider-echoed citation streams without any document/revision
    # identity, so it can never select retained knowledge bytes.
    provider_citations = [
        event for event in citation_events if event.get("revision_id") is None
    ]
    assert len(provider_citations) == 1
    assert provider_citations[0]["title"] == "model-chosen.md"
    assert service.publication is not None
    assert [citation["revision_id"] for citation in service.publication["citations"]] == [
        str(REVISION_ID),
        str(REVISION_ID),
    ]
