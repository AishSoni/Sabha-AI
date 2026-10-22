"""Unit tests for knowledge identity and eligibility rules (spec 09)."""

from __future__ import annotations

import uuid

import pytest

from app.modules.knowledge.domain.errors import (
    InvalidOwner,
    InvalidTransition,
    SourceTooLarge,
    UnsupportedFileType,
)
from app.modules.knowledge.domain.models import KnowledgeOwner, RevisionState
from app.modules.knowledge.domain.services import (
    MAX_SOURCE_BYTES,
    assert_transition,
    chunk_identities,
    ingestion_id_for,
    is_eligible,
    revision_id_for,
    sanitize_file_name,
    source_key_for,
    staging_key_for,
    validate_upload,
)


def test_owner_collection_names_match_the_vector_store_contract():
    meeting = KnowledgeOwner("meeting", uuid.uuid4())
    stack = KnowledgeOwner("stack", uuid.uuid4())
    persona = KnowledgeOwner("persona", uuid.uuid4())

    assert meeting.collection_name == f"meeting_{meeting.id}_shared"
    assert stack.collection_name == f"stack_{stack.id}_knowledge"
    assert persona.collection_name == f"persona_{persona.id}_knowledge"


def test_owner_rejects_unknown_kinds():
    with pytest.raises(InvalidOwner):
        KnowledgeOwner("team", uuid.uuid4())


def test_revision_and_ingestion_ids_are_deterministic_and_distinct():
    document_id = uuid.uuid4()

    first = revision_id_for(document_id)
    second = revision_id_for(document_id)
    other_revision = revision_id_for(document_id, revision_number=2)

    assert first == second
    assert first != other_revision
    assert ingestion_id_for(first) == ingestion_id_for(first)
    assert ingestion_id_for(first) != ingestion_id_for(other_revision)


def test_chunk_ids_are_stable_per_revision_index_and_content():
    revision_id = uuid.uuid4()

    first = chunk_identities(revision_id, ["alpha", "beta"])
    repeat = chunk_identities(revision_id, ["alpha", "beta"])
    changed = chunk_identities(revision_id, ["alpha", "beta!"])
    other_revision = chunk_identities(uuid.uuid4(), ["alpha", "beta"])

    assert [chunk.id for chunk in first] == [chunk.id for chunk in repeat]
    assert first[1].id != changed[1].id
    assert first[0].id != other_revision[0].id
    assert first[0].chunk_index == 0
    assert first[1].chunk_index == 1
    assert len(first[0].content_sha256) == 64


def test_file_names_are_sanitized_against_traversal_and_control_characters():
    assert sanitize_file_name("..\\..\\etc/passwd.txt") == "passwd.txt"
    assert sanitize_file_name("My Report (final).pdf") == "My_Report_final.pdf"
    assert sanitize_file_name("bad\x00name.md") == "bad_name.md"
    assert sanitize_file_name("") == "document"
    assert len(sanitize_file_name("a" * 500 + ".txt")) <= 124


def test_source_and_staging_keys_are_generated_per_owner_and_revision():
    owner = KnowledgeOwner("stack", uuid.UUID("11111111-1111-1111-1111-111111111111"))
    document_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    revision_id = uuid.UUID("33333333-3333-3333-3333-333333333333")

    key = source_key_for(owner, document_id, revision_id, "Notes.txt")

    assert key == (
        "sources/stack/11111111-1111-1111-1111-111111111111/"
        "22222222-2222-2222-2222-222222222222/"
        "33333333-3333-3333-3333-333333333333/Notes.txt"
    )
    assert staging_key_for(document_id, revision_id) == (
        "staging/22222222-2222-2222-2222-222222222222/"
        "33333333-3333-3333-3333-333333333333"
    )


@pytest.mark.parametrize("state", [RevisionState.PENDING, RevisionState.PARSING, RevisionState.INDEXING, RevisionState.FAILED])
def test_only_ready_without_revocation_is_eligible(state):
    assert is_eligible(state, revoked_at=None) is False
    assert is_eligible(RevisionState.READY, revoked_at=object()) is False


def test_ready_revision_without_revocation_is_eligible():
    assert is_eligible(RevisionState.READY, revoked_at=None) is True


def test_revision_state_transitions_are_checked():
    assert_transition(RevisionState.PENDING, RevisionState.PARSING)
    assert_transition(RevisionState.PARSING, RevisionState.INDEXING)
    assert_transition(RevisionState.INDEXING, RevisionState.READY)
    assert_transition(RevisionState.READY, RevisionState.REVOKED)

    with pytest.raises(InvalidTransition):
        assert_transition(RevisionState.PENDING, RevisionState.READY)
    with pytest.raises(InvalidTransition):
        assert_transition(RevisionState.REVOKED, RevisionState.READY)


def test_upload_validation_is_case_insensitive_and_bounded():
    validate_upload("Report.PDF", 10)
    validate_upload("sheet.csv", MAX_SOURCE_BYTES)

    with pytest.raises(UnsupportedFileType):
        validate_upload("legacy.xls", 10)
    with pytest.raises(SourceTooLarge):
        validate_upload("report.pdf", MAX_SOURCE_BYTES + 1)
    with pytest.raises(Exception):
        validate_upload("report.pdf", 0)
