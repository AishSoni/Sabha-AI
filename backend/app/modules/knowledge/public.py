"""Public interface of the Knowledge module.

Other modules (Meetings) request deletion, cleanup, uploads, and retrieval
here instead of reaching into Knowledge tables, source keys, or vector
collections.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from app.platform.config import settings
from app.platform.database import get_supabase
from app.modules.knowledge.application.deletion import (
    CleanupReport,
    CleanupWorker,
    DeleteDocument,
    DeleteParentKnowledge,
)
from app.modules.knowledge.application.ingestion import (
    EmbeddingProfile,
    IngestionWorker,
    UploadDocument,
    UploadReceipt,
    UploadRequest,
)
from app.modules.knowledge.application.ports import (
    DocumentRecord,
    ParentRevocationResult,
    RevocationResult,
)
from app.modules.knowledge.application.queries import (
    GetDocument,
    GetIngestionStatus,
    IngestionStatusView,
    ListDocuments,
)
from app.modules.knowledge.application.retrieval import (
    RetrievalRequest,
    RetrievedPassage,
    SearchKnowledge,
)
from app.modules.knowledge.infrastructure.parsers import LocalDocumentParser
from app.modules.knowledge.infrastructure.qdrant import QdrantKnowledgeProjection
from app.modules.knowledge.infrastructure.reconciliation import (
    ORPHANED_INGESTION_MESSAGE,
    reconcile_startup_state,
)
from app.modules.knowledge.infrastructure.source_store import SupabaseSourceStore
from app.modules.knowledge.infrastructure.supabase import SupabaseKnowledgeRepository
from app.modules.knowledge.infrastructure.vector_cleanup import (
    VectorCleanupLedger,
    get_vector_cleanup_ledger,
    record_pending_cleanup,
    reconcile_pending_vector_cleanups,
)

logger = logging.getLogger(__name__)


def _default_embedding_profile() -> EmbeddingProfile:
    from app.platform.providers.embeddings import get_embedding_provider

    provider = get_embedding_provider()
    return EmbeddingProfile(
        provider=settings.embedding_provider,
        model=settings.embedding_model,
        dimension=provider.dimension,
    )


class KnowledgeLifecycle:
    """Composition of Knowledge use cases shared by HTTP and other modules."""

    def __init__(
        self,
        *,
        persistence=None,
        source_store=None,
        vectors=None,
        parser=None,
        embedding: EmbeddingProfile | None = None,
        cleanup: CleanupWorker | None = None,
        worker: IngestionWorker | None = None,
    ) -> None:
        self.persistence = persistence or SupabaseKnowledgeRepository(get_supabase)
        self.source_store = source_store or SupabaseSourceStore(
            url=settings.supabase_url,
            service_key=settings.supabase_service_key or settings.supabase_key,
            bucket=settings.knowledge_bucket,
        )
        self.vectors = vectors or QdrantKnowledgeProjection()
        self.parser = parser or LocalDocumentParser()
        self.embedding = embedding or _default_embedding_profile()

        self._cleanup = cleanup or CleanupWorker(
            persistence=self.persistence,
            source_store=self.source_store,
            vectors=self.vectors,
        )
        self._worker = worker or IngestionWorker(
            source_store=self.source_store,
            persistence=self.persistence,
            parser=self.parser,
            vectors=self.vectors,
        )
        self._upload = UploadDocument(
            source_store=self.source_store,
            persistence=self.persistence,
            embedding=self.embedding,
        )
        self._status = GetIngestionStatus(self.persistence)
        self._list_documents = ListDocuments(self.persistence)
        self._get_document = GetDocument(self.persistence)
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

    async def upload(self, request: UploadRequest) -> UploadReceipt:
        return await self._upload.execute(request)

    async def process_ingestion(self, operation_id: UUID) -> None:
        await self._worker.process(operation_id)

    async def retry_ingestion(self, operation_id: UUID) -> None:
        await self._worker.process(operation_id)

    async def recover_ingestions(self, *, limit: int = 20) -> int:
        return await self._worker.recover(limit=limit)

    async def ingestion_status(
        self, operation_id: UUID
    ) -> IngestionStatusView | None:
        return await self._status.execute(operation_id)

    async def list_documents(
        self, *, owner_kind: str, owner_id: UUID
    ) -> list[DocumentRecord]:
        return await self._list_documents.execute(
            owner_kind=owner_kind, owner_id=owner_id
        )

    async def get_document(self, document_id: UUID) -> DocumentRecord | None:
        return await self._get_document.execute(document_id)

    async def purge_document_row(self, document_id: UUID) -> bool:
        """Remove the revoked document row; cleanup intents stay durable."""
        return await asyncio.to_thread(
            self.persistence.delete_document_row, document_id
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

    async def revalidate_revisions(
        self, revision_ids, *, meeting_id: UUID, stack_ids: list[UUID]
    ) -> set[UUID]:
        """Authoritative eligibility check before dispatching context."""
        return await asyncio.to_thread(
            self.persistence.revalidate_revisions,
            list(revision_ids),
            meeting_id=meeting_id,
            stack_ids=stack_ids,
        )

    async def attach_evidence_message(
        self,
        operation_id: UUID,
        tool_call_id: str,
        message_id: UUID,
    ) -> int:
        """Link already-recorded passages to the message that cited them."""
        return await asyncio.to_thread(
            self.persistence.attach_evidence_message,
            operation_id,
            tool_call_id,
            message_id,
        )

    async def sweep_staging(self, *, limit: int = 500) -> int:
        """Delete upload staging objects left behind by an interrupted process."""
        objects = await asyncio.to_thread(
            self.source_store.list_prefix,
            "staging/",
            limit=limit,
            recursive=True,
        )
        removed = 0
        for item in objects:
            try:
                await asyncio.to_thread(self.source_store.delete, item.key)
                removed += 1
            except Exception:  # noqa: BLE001 - best effort, startup must proceed
                logger.warning("Could not remove staging object %s", item.key)
        return removed


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
