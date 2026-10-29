"""Application tests for exact-revision content reads."""

from __future__ import annotations

import hashlib
from dataclasses import replace
from uuid import UUID, uuid4

import pytest

from app.modules.knowledge.application.content import ReadRevisionContent
from app.modules.knowledge.application.ports import (
    RevisionRecord,
    SourceObjectTooLarge,
    SourceStoreUnavailable,
)
from app.modules.knowledge.domain.errors import (
    RevisionNotFound,
    RevisionUnavailable,
    UnsupportedRepresentation,
)
from app.modules.knowledge.domain.models import RevisionState
from app.modules.knowledge.domain.services import MAX_SOURCE_BYTES

DOCUMENT_ID = UUID("00000000-0000-4000-8000-000000000010")
REVISION_ID = UUID("00000000-0000-4000-8000-000000000012")
SOURCE_KEY = "sources/meeting/one/document/revision/report.pdf"


def _revision(**overrides) -> RevisionRecord:
    payload = b"%PDF-1.7 retained"
    values = dict(
        document_id=DOCUMENT_ID,
        revision_id=REVISION_ID,
        state=RevisionState.READY,
        file_type="pdf",
        file_name="report.pdf",
        source_key=SOURCE_KEY,
        source_sha256=hashlib.sha256(payload).hexdigest(),
        source_size_bytes=len(payload),
        revoked_at=None,
    )
    values.update(overrides)
    return RevisionRecord(**values)


class FakePersistence:
    def __init__(self, revision: RevisionRecord | None) -> None:
        self.revision = revision
        self.calls: list[tuple[UUID, UUID]] = []

    def get_revision(self, document_id, revision_id):
        self.calls.append((document_id, revision_id))
        return self.revision


class FakeSourceStore:
    def __init__(self, payload: bytes | None = None, *, error=None) -> None:
        self.payload = payload
        self.error = error
        self.downloads: list[tuple[str, int]] = []

    def download(self, key, *, max_bytes):
        self.downloads.append((key, max_bytes))
        if self.error is not None:
            raise self.error
        return self.payload


class FakeParser:
    def __init__(self, text: str = "Extracted body", *, error=None) -> None:
        self.text = text
        self.error = error
        self.calls: list[tuple[bytes, str, str]] = []

    def extract_text(self, data, *, file_name, file_type):
        self.calls.append((data, file_name, file_type))
        if self.error is not None:
            raise self.error
        return self.text

    def parse(self, data, *, file_name, file_type):  # pragma: no cover - unused
        raise AssertionError("parse must not be used for previews")


def _use_case(
    revision=None,
    payload=b"%PDF-1.7 retained",
    *,
    parser=None,
    store_error=None,
):
    revision = revision if revision is not None else _revision()
    store = FakeSourceStore(payload, error=store_error)
    use_case = ReadRevisionContent(
        persistence=FakePersistence(revision),
        source_store=store,
        parser=parser or FakeParser(),
    )
    return use_case, store


@pytest.mark.asyncio
async def test_original_pdf_returns_verified_bytes_and_exact_identity():
    use_case, store = _use_case()

    content = await use_case.execute(DOCUMENT_ID, REVISION_ID)

    assert content.data == b"%PDF-1.7 retained"
    assert content.media_type == "application/pdf"
    assert content.file_name == "report.pdf"
    assert content.representation == "original"
    assert content.derived_from is None
    assert store.downloads == [(SOURCE_KEY, len(b"%PDF-1.7 retained"))]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("file_type", "media_type"),
    [
        ("txt", "text/plain; charset=utf-8"),
        ("md", "text/markdown; charset=utf-8"),
        ("csv", "text/csv; charset=utf-8"),
    ],
)
async def test_original_textual_formats_use_allowlisted_media_types(
    file_type, media_type
):
    payload = b"safe text"
    revision = _revision(
        file_type=file_type,
        file_name=f"notes.{file_type}",
        source_sha256=hashlib.sha256(payload).hexdigest(),
        source_size_bytes=len(payload),
    )
    use_case, _store = _use_case(revision, payload)

    content = await use_case.execute(DOCUMENT_ID, REVISION_ID)

    assert content.media_type == media_type
    assert content.data == payload


@pytest.mark.asyncio
async def test_original_office_document_requires_derived_text():
    use_case, store = _use_case(_revision(file_type="docx"))

    with pytest.raises(UnsupportedRepresentation):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)

    assert store.downloads


@pytest.mark.asyncio
async def test_derived_text_for_docx_uses_parser_and_plain_text_name():
    payload = b"PK docx"
    revision = _revision(
        file_type="docx",
        file_name="board pack.docx",
        source_sha256=hashlib.sha256(payload).hexdigest(),
        source_size_bytes=len(payload),
    )
    parser = FakeParser("Board pack body")
    use_case, _store = _use_case(revision, payload, parser=parser)

    content = await use_case.execute(
        DOCUMENT_ID, REVISION_ID, representation="text"
    )

    assert content.media_type == "text/plain; charset=utf-8"
    assert content.data == b"Board pack body"
    assert content.file_name == "board pack.txt"
    assert content.derived_from == "docx"
    assert parser.calls == [(payload, "board pack.docx", "docx")]


@pytest.mark.asyncio
async def test_derived_text_is_rejected_for_pdf():
    use_case, _store = _use_case()

    with pytest.raises(UnsupportedRepresentation):
        await use_case.execute(DOCUMENT_ID, REVISION_ID, representation="text")


@pytest.mark.asyncio
async def test_unknown_representation_is_rejected_before_storage():
    use_case, store = _use_case()

    with pytest.raises(UnsupportedRepresentation):
        await use_case.execute(DOCUMENT_ID, REVISION_ID, representation="html")

    assert store.downloads == []


@pytest.mark.asyncio
async def test_missing_revision_is_not_found():
    use_case = ReadRevisionContent(
        persistence=FakePersistence(None),
        source_store=FakeSourceStore(b""),
        parser=FakeParser(),
    )

    with pytest.raises(RevisionNotFound):
        await use_case.execute(DOCUMENT_ID, uuid4())


@pytest.mark.asyncio
@pytest.mark.parametrize("state", [RevisionState.PENDING, RevisionState.FAILED, RevisionState.REVOKED])
async def test_non_ready_revision_is_unavailable(state):
    use_case, store = _use_case(_revision(state=state))

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)

    assert store.downloads == []


@pytest.mark.asyncio
async def test_revoked_timestamp_is_unavailable():
    from datetime import datetime, timezone

    use_case, store = _use_case(
        _revision(revoked_at=datetime(2026, 10, 20, tzinfo=timezone.utc))
    )

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)

    assert store.downloads == []


@pytest.mark.asyncio
async def test_recorded_size_above_budget_is_unavailable_before_download():
    use_case, store = _use_case(
        _revision(source_size_bytes=MAX_SOURCE_BYTES + 1)
    )

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)

    assert store.downloads == []


@pytest.mark.asyncio
async def test_byte_count_mismatch_is_unavailable():
    use_case, _store = _use_case(_revision(), b"%PDF-1.7 retained plus extra")

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)


@pytest.mark.asyncio
async def test_hash_mismatch_is_unavailable():
    use_case, _store = _use_case(_revision(source_sha256="0" * 64))

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)


@pytest.mark.asyncio
async def test_missing_source_object_is_unavailable():
    use_case, _store = _use_case(
        store_error=SourceObjectTooLarge("too large")
    )

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)


@pytest.mark.asyncio
async def test_source_store_outage_propagates_unavailable():
    use_case, _store = _use_case(store_error=SourceStoreUnavailable("down"))

    with pytest.raises(SourceStoreUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID)


@pytest.mark.asyncio
async def test_parser_failure_is_unavailable():
    from app.modules.knowledge.domain.errors import EmptyExtraction

    payload = b"PK docx"
    revision = _revision(
        file_type="docx",
        source_sha256=hashlib.sha256(payload).hexdigest(),
        source_size_bytes=len(payload),
    )
    use_case, _store = _use_case(
        revision, payload, parser=FakeParser(error=EmptyExtraction("empty"))
    )

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID, representation="text")


@pytest.mark.asyncio
async def test_blank_derived_text_is_unavailable():
    payload = b"PK docx"
    revision = _revision(
        file_type="docx",
        source_sha256=hashlib.sha256(payload).hexdigest(),
        source_size_bytes=len(payload),
    )
    use_case, _store = _use_case(revision, payload, parser=FakeParser("   "))

    with pytest.raises(RevisionUnavailable):
        await use_case.execute(DOCUMENT_ID, REVISION_ID, representation="text")
