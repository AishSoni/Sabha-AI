"""Retrieval must trust SQL eligibility, not vector payload scope."""

from __future__ import annotations

from uuid import UUID, uuid4

from app.modules.knowledge.application.ports import VectorHit
from app.modules.knowledge.application.retrieval import (
    KnowledgeScope,
    RetrievalIdentity,
    RetrievalRequest,
    SearchKnowledge,
)
from app.modules.knowledge.domain.models import EligibleRevision


class FakeVectors:
    def __init__(self, hits: dict[str, list[VectorHit]]) -> None:
        self.hits = hits
        self.calls: list[tuple[str, list[UUID], str, int]] = []

    async def search(self, collection, *, revision_ids, query, limit):
        self.calls.append((collection, list(revision_ids), query, limit))
        return self.hits.get(collection, [])


class FakePersistence:
    def __init__(
        self, eligible: list[EligibleRevision], allowed: set[UUID] | None = None
    ) -> None:
        self.eligible = eligible
        self.allowed = allowed
        self.revalidated: list[list[UUID]] = []
        self.evidence: list = []

    def eligible_revisions(self, *, meeting_id, stack_ids):
        return self.eligible

    def revalidate_revisions(self, revision_ids, *, meeting_id, stack_ids):
        self.revalidated.append(list(revision_ids))
        if self.allowed is None:
            return set(revision_ids)
        return set(revision_ids) & self.allowed

    def record_evidence(self, passages):
        self.evidence.extend(passages)


def _revision(collection: str = "meeting_m_shared") -> EligibleRevision:
    return EligibleRevision(
        document_id=uuid4(),
        revision_id=uuid4(),
        collection_name=collection,
        file_name="report.txt",
    )


def _hit(revision: EligibleRevision, *, text: str, score: float) -> VectorHit:
    return VectorHit(
        text=text,
        score=score,
        document_id=revision.document_id,
        revision_id=revision.revision_id,
        chunk_id=uuid4(),
        chunk_index=0,
        content_sha256="a" * 64,
        file_name=revision.file_name,
    )


async def test_no_eligible_revisions_skips_the_vector_store():
    persistence = FakePersistence([])
    vectors = FakeVectors({})
    search = SearchKnowledge(persistence=persistence, vectors=vectors)

    result = await search.execute(
        RetrievalRequest(query="revenue", scope=KnowledgeScope(uuid4(), []))
    )

    assert result == []
    assert vectors.calls == []
    assert persistence.evidence == []


async def test_merges_collections_and_records_identity():
    shared = _revision("meeting_m_shared")
    stack = _revision("stack_s_knowledge")
    persistence = FakePersistence([shared, stack])
    vectors = FakeVectors(
        {
            shared.collection_name: [_hit(shared, text="alpha", score=0.4)],
            stack.collection_name: [_hit(stack, text="beta", score=0.9)],
        }
    )
    identity = RetrievalIdentity(
        operation_id=uuid4(),
        participant_id=uuid4(),
        tool_call_id="call-1",
        message_id=uuid4(),
    )
    scope = KnowledgeScope(uuid4(), [uuid4()])
    search = SearchKnowledge(persistence=persistence, vectors=vectors)

    result = await search.execute(
        RetrievalRequest(query="margin", scope=scope, identity=identity, limit=2)
    )

    assert [passage.text for passage in result] == ["beta", "alpha"]
    assert len(persistence.evidence) == 2
    evidence = persistence.evidence[0]
    assert evidence.raw_passage == "beta"
    assert evidence.operation_id == identity.operation_id
    assert evidence.tool_call_id == "call-1"
    assert evidence.participant_id == identity.participant_id
    assert evidence.message_id == identity.message_id


async def test_stale_vector_hits_are_rejected_by_sql_revalidation():
    eligible = _revision()
    stale = _revision()
    persistence = FakePersistence([eligible], allowed={eligible.revision_id})
    vectors = FakeVectors(
        {
            eligible.collection_name: [
                _hit(eligible, text="fresh", score=0.8),
                _hit(stale, text="stale", score=0.99),
            ]
        }
    )
    search = SearchKnowledge(persistence=persistence, vectors=vectors)

    result = await search.execute(
        RetrievalRequest(query="alpha", scope=KnowledgeScope(uuid4(), []))
    )

    assert [passage.text for passage in result] == ["fresh"]
    assert [item.raw_passage for item in persistence.evidence] == ["fresh"]


async def test_no_surviving_hits_records_no_evidence():
    eligible = _revision()
    persistence = FakePersistence([eligible], allowed=set())
    vectors = FakeVectors(
        {eligible.collection_name: [_hit(eligible, text="gone", score=0.5)]}
    )
    search = SearchKnowledge(persistence=persistence, vectors=vectors)

    result = await search.execute(
        RetrievalRequest(query="alpha", scope=KnowledgeScope(None, []))
    )

    assert result == []
    assert persistence.evidence == []
