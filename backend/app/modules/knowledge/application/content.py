"""Read the exact retained bytes of one document revision.

The revision identity is the authority: callers address both the document and
the revision, and the recorded source key is never accepted from outside. Only
a ready, non-revoked revision whose retained bytes still match the recorded
size and SHA-256 can be returned.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
from dataclasses import dataclass
from uuid import UUID

from app.modules.knowledge.application.ports import (
    DocumentParser,
    KnowledgePersistence,
    SourceStore,
    SourceStoreError,
    SourceStoreUnavailable,
)
from app.modules.knowledge.domain.errors import (
    KnowledgeError,
    RevisionNotFound,
    RevisionUnavailable,
    UnsupportedRepresentation,
)
from app.modules.knowledge.domain.models import RevisionState
from app.modules.knowledge.domain.services import MAX_SOURCE_BYTES

ORIGINAL_MEDIA_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "txt": "text/plain; charset=utf-8",
    "md": "text/markdown; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
}

DERIVED_FILE_TYPES = frozenset({"docx", "xlsx"})

REPRESENTATIONS = ("original", "text")


@dataclass(frozen=True)
class RevisionContent:
    """Bounded bytes for one representation of an exact revision."""

    data: bytes
    media_type: str
    file_name: str
    representation: str
    derived_from: str | None = None


class ReadRevisionContent:
    """Resolve one revision and return its verified original or derived text."""

    def __init__(
        self,
        *,
        persistence: KnowledgePersistence,
        source_store: SourceStore,
        parser: DocumentParser,
    ) -> None:
        self._persistence = persistence
        self._source_store = source_store
        self._parser = parser

    async def execute(
        self,
        document_id: UUID,
        revision_id: UUID,
        *,
        representation: str = "original",
    ) -> RevisionContent:
        if representation not in REPRESENTATIONS:
            raise UnsupportedRepresentation(
                "Supported representations are 'original' and 'text'"
            )

        revision = await asyncio.to_thread(
            self._persistence.get_revision, document_id, revision_id
        )
        if revision is None:
            raise RevisionNotFound("Document revision not found")

        if revision.state is not RevisionState.READY or revision.revoked_at:
            raise RevisionUnavailable(
                "This document revision is no longer available"
            )
        if (
            revision.source_size_bytes <= 0
            or revision.source_size_bytes > MAX_SOURCE_BYTES
            or not revision.source_key
            or not revision.source_sha256
        ):
            raise RevisionUnavailable(
                "This document revision is no longer available"
            )

        try:
            data = await asyncio.to_thread(
                self._source_store.download,
                revision.source_key,
                max_bytes=revision.source_size_bytes,
            )
        except SourceStoreUnavailable:
            raise
        except SourceStoreError as exc:
            raise RevisionUnavailable(
                "The retained document revision could not be read"
            ) from exc

        if len(data) != revision.source_size_bytes:
            raise RevisionUnavailable(
                "The retained document revision does not match its record"
            )
        digest = hashlib.sha256(data).hexdigest()
        if not hmac.compare_digest(digest, revision.source_sha256):
            raise RevisionUnavailable(
                "The retained document revision does not match its record"
            )

        file_type = revision.file_type.lower()
        if representation == "original":
            media_type = ORIGINAL_MEDIA_TYPES.get(file_type)
            if media_type is None:
                raise UnsupportedRepresentation(
                    "Original preview is not available for this format; "
                    "use the derived text representation"
                )
            return RevisionContent(
                data=data,
                media_type=media_type,
                file_name=revision.file_name,
                representation="original",
            )

        if file_type not in DERIVED_FILE_TYPES:
            raise UnsupportedRepresentation(
                "Derived text is only available for DOCX and XLSX documents"
            )
        try:
            text = await asyncio.to_thread(
                self._parser.extract_text,
                data,
                file_name=revision.file_name,
                file_type=file_type,
            )
        except KnowledgeError as exc:
            raise RevisionUnavailable(
                "The retained document revision could not be parsed"
            ) from exc
        if not text.strip():
            raise RevisionUnavailable(
                "The retained document revision has no readable text"
            )
        return RevisionContent(
            data=text.encode("utf-8"),
            media_type="text/plain; charset=utf-8",
            file_name=f"{_stem(revision.file_name)}.txt",
            representation="text",
            derived_from=file_type,
        )


def _stem(file_name: str) -> str:
    name = file_name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    stem, dot, _suffix = name.rpartition(".")
    return stem if dot and stem else name
