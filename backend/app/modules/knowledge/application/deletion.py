"""Deletion commits eligibility first, then retries physical cleanup.

Revocation is a single SQL transaction: the document, its revisions, and its
ingestions stop being eligible immediately and durable cleanup intents are
recorded. Source bytes, vector points, and retained evidence are removed
afterwards; a failed physical step stays visible and retryable, but it can
never make the document eligible again.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from uuid import UUID

from app.modules.knowledge.application.ports import (
    KnowledgePersistence,
    RevocationResult,
    SourceStore,
    VectorProjection,
)
from app.modules.knowledge.domain.models import CleanupIntent

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CleanupReport:
    attempted: int
    resolved: int
    failed: int


class CleanupWorker:
    """Resolve durable cleanup intents without touching eligibility."""

    def __init__(
        self,
        *,
        persistence: KnowledgePersistence,
        source_store: SourceStore,
        vectors: VectorProjection,
    ) -> None:
        self._persistence = persistence
        self._source_store = source_store
        self._vectors = vectors

    async def run(self, *, limit: int = 50) -> CleanupReport:
        intents = await asyncio.to_thread(
            self._persistence.list_cleanup_intents, limit=limit
        )
        resolved = 0
        failed = 0
        for intent in intents:
            try:
                await self._apply(intent)
            except Exception as exc:  # noqa: BLE001 - one failure must not block others
                failed += 1
                message = f"{type(exc).__name__}: {exc}"[:500]
                logger.warning(
                    "knowledge cleanup intent %s (%s) failed: %s",
                    intent.intent_id,
                    intent.kind,
                    message,
                )
                try:
                    await asyncio.to_thread(
                        self._persistence.note_cleanup_failure,
                        intent.intent_id,
                        message,
                    )
                except Exception:  # noqa: BLE001 - retry remains durable
                    logger.exception(
                        "could not record knowledge cleanup failure for %s",
                        intent.intent_id,
                    )
                continue
            try:
                await asyncio.to_thread(
                    self._persistence.resolve_cleanup, intent.intent_id
                )
            except Exception:  # noqa: BLE001 - a resolved step stays idempotent
                logger.exception(
                    "could not resolve knowledge cleanup intent %s",
                    intent.intent_id,
                )
                failed += 1
                continue
            resolved += 1
        return CleanupReport(
            attempted=len(intents), resolved=resolved, failed=failed
        )

    async def _apply(self, intent: CleanupIntent) -> None:
        if intent.kind == "source_object":
            if not intent.source_key:
                raise ValueError("source_object cleanup has no source key")
            await asyncio.to_thread(
                self._source_store.delete, intent.source_key
            )
            return
        if intent.kind == "vector_revision":
            if not intent.collection_name or not intent.revision_id:
                raise ValueError("vector_revision cleanup is incomplete")
            await self._vectors.delete_revision(
                intent.collection_name, intent.revision_id
            )
            return
        if intent.kind == "vector_collection":
            if not intent.collection_name:
                raise ValueError("vector_collection cleanup has no collection")
            await self._vectors.delete_collection(intent.collection_name)
            return
        if intent.kind == "evidence_redaction":
            if not intent.revision_id:
                raise ValueError("evidence_redaction cleanup has no revision")
            await asyncio.to_thread(
                self._persistence.redact_evidence,
                intent.revision_id,
                reason=intent.reason or "source deleted",
            )
            await asyncio.to_thread(
                self._persistence.redact_message_artifacts,
                intent.revision_id,
                reason=intent.reason or "source deleted",
            )
            return
        raise ValueError(f"unsupported knowledge cleanup kind {intent.kind!r}")


class DeleteDocument:
    """Revoke immediately, then attempt the durable cleanup pass."""

    def __init__(
        self,
        *,
        persistence: KnowledgePersistence,
        cleanup: CleanupWorker,
    ) -> None:
        self._persistence = persistence
        self._cleanup = cleanup

    async def execute(
        self, document_id: UUID, *, reason: str = "user_requested"
    ) -> RevocationResult:
        result = await asyncio.to_thread(
            self._persistence.revoke_document,
            document_id,
            reason=reason,
        )
        await self._cleanup.run()
        return result
