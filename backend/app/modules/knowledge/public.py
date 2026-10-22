"""Public interface of the Knowledge module.

Other modules (Meetings) request deletion and cleanup here instead of
reaching into Knowledge tables, source keys, or vector collections.
"""

from __future__ import annotations

from uuid import UUID

from app.core.config import settings
from app.core.database import get_supabase
from app.modules.knowledge.application.deletion import (
    CleanupReport,
    CleanupWorker,
    DeleteDocument,
    DeleteParentKnowledge,
)
from app.modules.knowledge.application.ports import (
    ParentRevocationResult,
    RevocationResult,
)
from app.modules.knowledge.application.retrieval import (
    RetrievalRequest,
    RetrievedPassage,
    SearchKnowledge,
)
from app.modules.knowledge.infrastructure.qdrant import QdrantKnowledgeProjection
from app.modules.knowledge.infrastructure.source_store import SupabaseSourceStore
from app.modules.knowledge.infrastructure.supabase import SupabaseKnowledgeRepository


class KnowledgeLifecycle:
    """Composition of Knowledge use cases shared by HTTP and other modules."""

    def __init__(self) -> None:
        self.persistence = SupabaseKnowledgeRepository(get_supabase)
        self.source_store = SupabaseSourceStore(
            settings.supabase_url,
            settings.supabase_service_key or settings.supabase_key,
            bucket=settings.knowledge_bucket,
        )
        self.vectors = QdrantKnowledgeProjection()
        self._cleanup = CleanupWorker(
            persistence=self.persistence,
            source_store=self.source_store,
            vectors=self.vectors,
        )
        self._delete_document = DeleteDocument(
            persistence=self.persistence,
            cleanup=self._cleanup,
        )
        self._delete_parent = DeleteParentKnowledge(
            persistence=self.persistence,
            cleanup=self._cleanup,
        )
        self._search = SearchKnowledge(
            persistence=self.persistence,
            vectors=self.vectors,
        )

    async def delete_document(
        self, document_id: UUID, *, reason: str = "user_requested"
    ) -> RevocationResult:
        return await self._delete_document.execute(document_id, reason=reason)

    async def delete_parent(
        self,
        parent_kind: str,
        parent_id: UUID,
        *,
        reason: str = "parent_deleted",
    ) -> ParentRevocationResult:
        return await self._delete_parent.execute(
            parent_kind, parent_id, reason=reason
        )

    async def run_cleanup(self, *, limit: int = 50) -> CleanupReport:
        return await self._cleanup.run(limit=limit)

    async def search(self, request: RetrievalRequest) -> list[RetrievedPassage]:
        return await self._search.execute(request)


_knowledge_lifecycle: KnowledgeLifecycle | None = None


def get_knowledge_lifecycle() -> KnowledgeLifecycle:
    global _knowledge_lifecycle
    if _knowledge_lifecycle is None:
        _knowledge_lifecycle = KnowledgeLifecycle()
    return _knowledge_lifecycle


def set_knowledge_lifecycle(lifecycle: KnowledgeLifecycle | None) -> None:
    """Replace/clear the singleton; intended for tests and composition roots."""

    global _knowledge_lifecycle
    _knowledge_lifecycle = lifecycle
