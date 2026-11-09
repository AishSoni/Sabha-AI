"""Knowledge domain rules: identity, keys, eligibility, transitions."""

from __future__ import annotations

import hashlib
import re
from pathlib import PurePosixPath
from typing import Iterable
from uuid import NAMESPACE_URL, UUID, uuid5

from .errors import InvalidTransition, SourceTooLarge, UnsupportedFileType, UploadRejected
from .models import ChunkIdentity, KnowledgeOwner, RevisionState

MAX_SOURCE_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = frozenset({"pdf", "docx", "xlsx", "csv", "txt", "md"})

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
_MAX_STEM = 120

_ALLOWED_TRANSITIONS: dict[RevisionState, frozenset[RevisionState]] = {
    RevisionState.PENDING: frozenset(
        {RevisionState.PARSING, RevisionState.FAILED, RevisionState.REVOKED}
    ),
    RevisionState.PARSING: frozenset(
        {RevisionState.INDEXING, RevisionState.FAILED, RevisionState.REVOKED}
    ),
    RevisionState.INDEXING: frozenset(
        {RevisionState.READY, RevisionState.FAILED, RevisionState.REVOKED}
    ),
    RevisionState.READY: frozenset({RevisionState.REVOKED}),
    RevisionState.FAILED: frozenset({RevisionState.PARSING, RevisionState.REVOKED}),
    RevisionState.REVOKED: frozenset(),
    RevisionState.UNAVAILABLE: frozenset(),
}


def revision_id_for(document_id: UUID, revision_number: int = 1) -> UUID:
    return uuid5(
        NAMESPACE_URL,
        f"sabha:revision:{document_id}:{revision_number}",
    )


def ingestion_id_for(revision_id: UUID) -> UUID:
    return uuid5(NAMESPACE_URL, f"sabha:ingestion:{revision_id}")


def document_id_for_request(owner: KnowledgeOwner, request_key: str) -> UUID:
    """Derive one document identity from a retained upload intent.

    A replay with the same key and owner targets the same revision even when
    the first receipt never reached the browser; a different key (a separate
    intent, even for identical bytes) keeps its own document identity.
    """
    return uuid5(
        NAMESPACE_URL,
        f"sabha:document-request:{owner.kind}:{owner.id}:{request_key}",
    )


def chunk_identities(
    revision_id: UUID, texts: Iterable[str], *, start_index: int = 0
) -> list[ChunkIdentity]:
    identities: list[ChunkIdentity] = []
    for offset, text in enumerate(texts):
        index = start_index + offset
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        identities.append(
            ChunkIdentity(
                id=uuid5(
                    NAMESPACE_URL,
                    f"sabha:chunk:{revision_id}:{index}:{digest}",
                ),
                chunk_index=index,
                content_sha256=digest,
                char_count=len(text),
            )
        )
    return identities


def is_eligible(state: RevisionState | str, revoked_at: object | None) -> bool:
    return state == RevisionState.READY and revoked_at is None


def assert_transition(current: RevisionState, target: RevisionState) -> None:
    if target not in _ALLOWED_TRANSITIONS[current]:
        raise InvalidTransition(f"revision cannot move {current.value} -> {target.value}")


def sanitize_file_name(file_name: str) -> str:
    raw = (file_name or "").replace("\\", "/")
    base = PurePosixPath(raw).name.strip()
    base = "".join(
        "_" if ord(char) < 32 or ord(char) == 0x7F else char for char in base
    )
    if not base:
        return "document"
    path = PurePosixPath(base)
    suffix = path.suffix[:16]
    stem = path.stem if path.suffix else base
    safe_stem = _SAFE_NAME.sub("_", stem).strip("._") or "document"
    return f"{safe_stem[:_MAX_STEM]}{suffix}"


def source_key_for(
    owner: KnowledgeOwner,
    document_id: UUID,
    revision_id: UUID,
    file_name: str,
    content_sha256: str | None = None,
) -> str:
    # A keyed replay can arrive with different bytes for the same intent. The
    # content hash keeps the refused attempt from overwriting the bytes the
    # admitted revision still points at.
    content_segment = f"{content_sha256}/" if content_sha256 else ""
    return (
        f"sources/{owner.kind}/{owner.id}/{document_id}/{revision_id}/"
        f"{content_segment}{sanitize_file_name(file_name)}"
    )


def staging_key_for(document_id: UUID, revision_id: UUID) -> str:
    return f"staging/{document_id}/{revision_id}"


def validate_upload(file_name: str, size_bytes: int) -> None:
    suffix = PurePosixPath((file_name or "").replace("\\", "/")).suffix.lower()
    if suffix.lstrip(".") not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileType(f"unsupported file type {suffix or '(none)'!r}")
    if size_bytes <= 0:
        raise UploadRejected("file is empty", code="empty_file")
    if size_bytes > MAX_SOURCE_BYTES:
        raise SourceTooLarge(
            f"file exceeds the {MAX_SOURCE_BYTES // (1024 * 1024)} MiB source budget"
        )
