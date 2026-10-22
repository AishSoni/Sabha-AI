"""Durable knowledge schema contract (spec 09).

These tests execute against a real disposable Postgres. They pin the SQL
facts other adapters depend on: admission is atomic, claims are leased,
readiness is conditional, eligibility is authoritative, and deletion
records retryable cleanup plus a replayable manifest.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[2] / "migrations" / "025_durable_knowledge.sql"
)

SOURCE_KEY = "sources/stack/{owner}/{document}/{revision}/notes.txt"
SHA = "a" * 64


def _uuid() -> str:
    return str(uuid.uuid4())


def _seed_meeting(db, name: str = "Knowledge meeting") -> str:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO meetings (name, status) VALUES (%s, 'active') RETURNING id",
            (name,),
        ).fetchone()
    return str(row[0])


def _seed_stack(db, name: str = "Investor stack") -> str:
    with db.connect() as conn:
        row = conn.execute(
            "INSERT INTO knowledge_stacks (name) VALUES (%s) RETURNING id",
            (name,),
        ).fetchone()
    return str(row[0])


def _admit(
    db,
    *,
    meeting_id: str | None = None,
    stack_id: str | None = None,
    document_id: str | None = None,
    revision_id: str | None = None,
    ingestion_id: str | None = None,
    file_name: str = "notes.txt",
    size_bytes: int = 42,
    status: str = "pending",
):
    document_id = document_id or _uuid()
    revision_id = revision_id or _uuid()
    ingestion_id = ingestion_id or _uuid()
    owner = stack_id or meeting_id or ""
    with db.connect() as conn:
        result = conn.execute(
            """
            SELECT knowledge_admit_upload(
                %s, %s, %s, %s, NULL, %s, %s, 'txt', %s, %s, %s, %s,
                %s, %s, %s
            )
            """,
            (
                document_id,
                revision_id,
                ingestion_id,
                meeting_id,
                stack_id,
                file_name,
                size_bytes,
                f"stack_{owner}_knowledge" if stack_id else f"meeting_{owner}_shared",
                SOURCE_KEY.format(
                    owner=owner, document=document_id, revision=revision_id
                ),
                SHA,
                "ollama",
                "nomic-embed-text",
                768,
            ),
        ).fetchone()
    return document_id, revision_id, ingestion_id, result[0]


def _claim(db, ingestion_id: str, *, now: datetime | None = None, lease: int = 60):
    now = now or datetime.now(timezone.utc)
    with db.connect() as conn:
        return conn.execute(
            "SELECT knowledge_claim_ingestion(%s, 'worker-1', %s, %s)",
            (ingestion_id, now, lease),
        ).fetchone()[0]


def _publish(db, ingestion_id: str, revision_id: str, *, count: int = 1):
    chunks = [
        {
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{revision_id}:{index}")),
            "chunk_index": index,
            "content_sha256": SHA,
            "char_count": 12,
        }
        for index in range(count)
    ]
    import json

    with db.connect() as conn:
        return conn.execute(
            "SELECT knowledge_publish_revision(%s, %s, %s, %s::jsonb)",
            (ingestion_id, revision_id, count, json.dumps(chunks)),
        ).fetchone()[0]


def _make_ready(db, *, meeting_id=None, stack_id=None, file_name="notes.txt"):
    document_id, revision_id, ingestion_id, _ = _admit(
        db, meeting_id=meeting_id, stack_id=stack_id, file_name=file_name
    )
    assert _claim(db, ingestion_id)["outcome"] == "claimed"
    with db.connect() as conn:
        conn.execute(
            "SELECT knowledge_start_indexing(%s, %s)",
            (ingestion_id, revision_id),
        )
    assert _publish(db, ingestion_id, revision_id)["outcome"] == "ready"
    return document_id, revision_id, ingestion_id


def test_admission_commits_document_revision_and_pending_receipt(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)

    document_id, revision_id, ingestion_id, receipt = _admit(
        db, meeting_id=meeting_id
    )

    assert receipt["outcome"] == "admitted"
    assert receipt["document_id"] == document_id
    assert receipt["revision_id"] == revision_id
    assert receipt["state"] == "pending"

    with db.connect() as conn:
        document = conn.execute(
            "SELECT status, chunk_count FROM documents WHERE id = %s",
            (document_id,),
        ).fetchone()
        revision = conn.execute(
            "SELECT status, source_sha256, embedding_dimension FROM document_revisions WHERE id = %s",
            (revision_id,),
        ).fetchone()
        job = conn.execute(
            "SELECT state, attempts FROM document_ingestions WHERE id = %s",
            (ingestion_id,),
        ).fetchone()

    assert document == ("processing", 0)
    assert revision == ("pending", SHA, 768)
    assert job == ("pending", 0)


def test_repeated_admission_returns_the_same_durable_receipt(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    document_id, revision_id, ingestion_id = _uuid(), _uuid(), _uuid()

    first = _admit(
        db,
        meeting_id=meeting_id,
        document_id=document_id,
        revision_id=revision_id,
        ingestion_id=ingestion_id,
    )[3]
    second = _admit(
        db,
        meeting_id=meeting_id,
        document_id=document_id,
        revision_id=revision_id,
        ingestion_id=ingestion_id,
    )[3]

    assert first["outcome"] == "admitted"
    assert second["outcome"] == "existing"
    with db.connect() as conn:
        count = conn.execute("SELECT count(*) FROM documents").fetchone()[0]
    assert count == 1


def test_admission_rejects_missing_or_multiple_owners(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    stack_id = _seed_stack(db)

    with pytest.raises(Exception):
        _admit(db, meeting_id=meeting_id, stack_id=stack_id)
    with pytest.raises(Exception):
        _admit(db)


def test_claims_are_leased_and_expire(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    _, _, ingestion_id, _ = _admit(db, meeting_id=meeting_id)
    now = datetime.now(timezone.utc)

    assert _claim(db, ingestion_id, now=now, lease=60)["outcome"] == "claimed"
    assert _claim(db, ingestion_id, now=now + timedelta(seconds=5))["outcome"] == "busy"

    reclaimed = _claim(db, ingestion_id, now=now + timedelta(seconds=61), lease=60)
    assert reclaimed["outcome"] == "claimed"
    assert reclaimed["attempts"] == 2


def test_publish_is_conditional_and_commits_chunks_with_ready(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    document_id, revision_id, ingestion_id, _ = _admit(db, meeting_id=meeting_id)
    _claim(db, ingestion_id)
    with db.connect() as conn:
        assert conn.execute(
            "SELECT knowledge_start_indexing(%s, %s)",
            (ingestion_id, revision_id),
        ).fetchone()[0]
        conn.execute(
            "UPDATE documents SET status = 'processing' WHERE id = %s",
            (document_id,),
        )

    result = _publish(db, ingestion_id, revision_id, count=2)

    assert result["outcome"] == "ready"
    with db.connect() as conn:
        revision = conn.execute(
            "SELECT status, chunk_count FROM document_revisions WHERE id = %s",
            (revision_id,),
        ).fetchone()
        document = conn.execute(
            "SELECT status, chunk_count FROM documents WHERE id = %s",
            (document_id,),
        ).fetchone()
        chunks = conn.execute(
            "SELECT count(*) FROM document_chunks WHERE revision_id = %s",
            (revision_id,),
        ).fetchone()[0]
        eligible = conn.execute(
            "SELECT document_id, revision_id FROM knowledge_eligible_revisions(%s, NULL)",
            (meeting_id,),
        ).fetchall()
    assert revision == ("ready", 2)
    assert document == ("ready", 2)
    assert chunks == 2
    assert eligible == [(uuid.UUID(document_id), uuid.UUID(revision_id))]


def test_revocation_wins_over_a_late_publish(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    document_id, revision_id, ingestion_id, _ = _admit(db, meeting_id=meeting_id)
    _claim(db, ingestion_id)
    with db.connect() as conn:
        conn.execute(
            "SELECT knowledge_revoke_document(%s, 'deleted by director')",
            (document_id,),
        )

    result = _publish(db, ingestion_id, revision_id)

    assert result["outcome"] == "revoked"
    with db.connect() as conn:
        eligible = conn.execute(
            "SELECT count(*) FROM knowledge_eligible_revisions(%s, NULL)",
            (meeting_id,),
        ).fetchone()[0]
        kind_count = conn.execute(
            """
            SELECT count(*) FROM knowledge_cleanup
            WHERE document_id = %s AND resolved_at IS NULL
            """,
            (document_id,),
        ).fetchone()[0]
    assert eligible == 0
    assert kind_count == 3


def test_eligibility_is_limited_to_meeting_shared_and_assigned_stacks(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    assigned_stack = _seed_stack(db, "Assigned")
    other_stack = _seed_stack(db, "Other")
    assigned_doc, assigned_rev, _ = _make_ready(
        db, stack_id=assigned_stack, file_name="assigned.txt"
    )
    other_doc, other_rev, _ = _make_ready(
        db, stack_id=other_stack, file_name="other.txt"
    )
    meeting_doc, meeting_rev, _ = _make_ready(db, meeting_id=meeting_id)

    with db.connect() as conn:
        rows = conn.execute(
            "SELECT document_id, revision_id FROM knowledge_eligible_revisions(%s, %s)",
            (meeting_id, [assigned_stack]),
        ).fetchall()

    assert sorted(rows) == sorted(
        [
            (uuid.UUID(assigned_doc), uuid.UUID(assigned_rev)),
            (uuid.UUID(meeting_doc), uuid.UUID(meeting_rev)),
        ]
    )
    assert (uuid.UUID(other_doc), uuid.UUID(other_rev)) not in rows


def test_pending_and_failed_revisions_are_never_eligible_even_with_vectors(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    _make_ready(db, meeting_id=meeting_id)
    pending_document, pending_revision, _, _ = _admit(db, meeting_id=meeting_id)
    failed_document, failed_revision, failed_ingestion, _ = _admit(
        db, meeting_id=meeting_id
    )
    _claim(db, failed_ingestion)
    with db.connect() as conn:
        conn.execute(
            "SELECT knowledge_fail_ingestion(%s, %s, 'parse failed')",
            (failed_ingestion, failed_revision),
        )
        revisions = conn.execute(
            "SELECT revision_id FROM knowledge_eligible_revisions(%s, NULL)",
            (meeting_id,),
        ).fetchall()

    eligible_ids = {str(row[0]) for row in revisions}
    assert pending_revision not in eligible_ids
    assert failed_revision not in eligible_ids
    assert pending_revision not in eligible_ids and pending_document != failed_document


def test_evidence_redaction_nulls_raw_passages_and_records_a_manifest_event(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    document_id, revision_id, ingestion_id = _make_ready(db, meeting_id=meeting_id)
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO retrieved_passage_evidence
                (meeting_id, document_id, revision_id, source_name, raw_passage)
            VALUES (%s, %s, %s, 'notes.txt', 'SENTINEL-CONFIDENTIAL'),
            (%s, %s, %s, 'notes.txt', 'SENTINEL-CONFIDENTIAL 2')
            """,
            (meeting_id, document_id, revision_id, meeting_id, document_id, revision_id),
        )
        count = conn.execute(
            "SELECT knowledge_redact_evidence(%s, 'source deleted')",
            (revision_id,),
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT raw_passage, redacted_at FROM retrieved_passage_evidence WHERE revision_id = %s",
            (revision_id,),
        ).fetchall()
        events = conn.execute(
            "SELECT event_kind FROM knowledge_deletion_events WHERE revision_id = %s",
            (revision_id,),
        ).fetchall()

    assert count == 2
    assert all(row[0] is None and row[1] is not None for row in rows)
    assert ("evidence_redacted",) in events


def test_parent_cleanup_revokes_every_owned_document_without_touching_other_stacks(disposable_db):
    db = disposable_db
    stack_id = _seed_stack(db)
    other_stack = _seed_stack(db, "Other")
    first, first_revision, _ = _make_ready(db, stack_id=stack_id)
    second, second_revision, _ = _make_ready(db, stack_id=stack_id)
    untouched, untouched_revision, _ = _make_ready(db, stack_id=other_stack)

    with db.connect() as conn:
        result = conn.execute(
            "SELECT knowledge_revoke_parent('stack', %s, 'stack deleted')",
            (stack_id,),
        ).fetchone()[0]
        states = conn.execute(
            "SELECT id, status FROM documents WHERE id = ANY(%s)",
            ([first, second, untouched],),
        ).fetchall()

    assert result["documents"] == 2
    state_by_id = {str(row[0]): row[1] for row in states}
    assert state_by_id[first] == "revoked"
    assert state_by_id[second] == "revoked"
    assert state_by_id[untouched] == "ready"


def test_restore_replays_newer_deletion_and_redaction_events(disposable_db):
    db = disposable_db
    meeting_id = _seed_meeting(db)
    document_id, revision_id, ingestion_id = _make_ready(db, meeting_id=meeting_id)
    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO retrieved_passage_evidence
                (meeting_id, document_id, revision_id, source_name, raw_passage)
            VALUES (%s, %s, %s, 'notes.txt', 'SENTINEL')
            """,
            (meeting_id, document_id, revision_id),
        )
        cutoff = conn.execute("SELECT NOW()").fetchone()[0]
        conn.execute(
            "SELECT knowledge_revoke_document(%s, 'deleted before restore')",
            (document_id,),
        )
        conn.execute(
            "SELECT knowledge_redact_evidence(%s, 'deleted before restore')",
            (revision_id,),
        )

        # Simulate restoring a backup taken at the cutoff: source objects and
        # SQL rows reappear, but the newer manifest rows were captured too.
        conn.execute(
            "UPDATE documents SET status = 'ready' WHERE id = %s",
            (document_id,),
        )
        conn.execute(
            "UPDATE document_revisions SET status = 'ready', revoked_at = NULL WHERE id = %s",
            (revision_id,),
        )
        conn.execute(
            "UPDATE retrieved_passage_evidence SET raw_passage = 'SENTINEL', redacted_at = NULL WHERE revision_id = %s",
            (revision_id,),
        )
        replay = conn.execute(
            "SELECT knowledge_replay_deletion_events(%s)",
            (cutoff - timedelta(seconds=1),),
        ).fetchone()[0]
        revision = conn.execute(
            "SELECT status, revoked_at FROM document_revisions WHERE id = %s",
            (revision_id,),
        ).fetchone()
        evidence = conn.execute(
            "SELECT raw_passage, redacted_at FROM retrieved_passage_evidence WHERE revision_id = %s",
            (revision_id,),
        ).fetchone()

    assert replay["revoked_events"] == 1
    assert replay["redacted_events"] == 1
    assert revision[0] == "revoked" and revision[1] is not None
    assert evidence[0] is None and evidence[1] is not None


def test_legacy_indexed_rows_become_honestly_unavailable(legacy_db):
    db = legacy_db
    with db.connect() as conn:
        meeting_id = conn.execute(
            "INSERT INTO meetings (name, status) VALUES ('Legacy', 'active') RETURNING id"
        ).fetchone()[0]
        document_id = conn.execute(
            """
            INSERT INTO documents
                (meeting_id, file_name, file_type, file_size_bytes, status, qdrant_collection)
            VALUES (%s, 'legacy.txt', 'txt', 10, 'indexed', 'meeting_legacy_shared')
            RETURNING id
            """,
            (meeting_id,),
        ).fetchone()[0]
        conn.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
        document = conn.execute(
            "SELECT status, error_message FROM documents WHERE id = %s",
            (document_id,),
        ).fetchone()
        revision = conn.execute(
            "SELECT status, revoked_at FROM document_revisions WHERE document_id = %s",
            (document_id,),
        ).fetchone()
        eligible = conn.execute(
            "SELECT count(*) FROM knowledge_eligible_revisions(%s, NULL)",
            (meeting_id,),
        ).fetchone()[0]

    assert document[0] == "unavailable"
    assert "re-upload" in document[1]
    assert revision[0] == "unavailable" and revision[1] is not None
    assert eligible == 0

