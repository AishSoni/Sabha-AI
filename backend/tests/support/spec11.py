"""Spec-11 upgrade dataset helpers.

The dataset is a real Phase 1 database (baseline + 002..013) with deterministic
legacy rows, then adopted and upgraded through the same runner used by
deployments. It deliberately never writes a post-Phase-1 column, so the
upgrade assertions can tell "preserved" apart from "invented".
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.migrate import adopt_phase_one

from tests.conftest import DisposableDb

SEED_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "spec11" / "phase_one_seed.sql"

MEETING_ACTIVE = "f3000000-0000-4000-8000-000000000001"
MEETING_ENDED = "f3000000-0000-4000-8000-000000000002"
MEETING_ARCHIVED_ENDED = "f3000000-0000-4000-8000-000000000003"
MEETING_ARCHIVED_ACTIVE = "f3000000-0000-4000-8000-000000000004"

PARTICIPANT_LEGACY_NULL = "f3100000-0000-4000-8000-000000000001"
PARTICIPANT_EMPTY = "f3100000-0000-4000-8000-000000000002"
PARTICIPANT_SNAPSHOT = "f3100000-0000-4000-8000-000000000003"

MESSAGE_USER = "f3200000-0000-4000-8000-000000000001"
MESSAGE_AI = "f3200000-0000-4000-8000-000000000002"

DOCUMENT_INDEXED = "f3300000-0000-4000-8000-000000000001"
DOCUMENT_PROCESSING = "f3300000-0000-4000-8000-000000000002"
DOCUMENT_FAILED = "f3300000-0000-4000-8000-000000000003"
DOCUMENT_STACK = "f3300000-0000-4000-8000-000000000004"
DOCUMENT_PERSONA = "f3300000-0000-4000-8000-000000000005"


def _dict_rows(db: DisposableDb, sql: str, params: Any = None) -> list[dict[str, Any]]:
    with db.connect() as conn:
        cursor = conn.execute(sql, params)
        columns = [column.name for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


class UpgradeDataset:
    """One disposable Phase 1 database and its target-upgrade history."""

    def __init__(self, db: DisposableDb):
        self.db = db

    def seed_phase_one_data(self) -> None:
        with self.db.connect() as conn:
            conn.execute(SEED_PATH.read_text(encoding="utf-8"))

    def apply_target_migrations(self) -> list[str]:
        return adopt_phase_one(self.db.uri)

    def read_preserved_history(self) -> dict[str, Any]:
        return {
            "meetings": _dict_rows(
                self.db,
                """
                SELECT id::text AS id, status, total_cost, archived_at, created_at
                FROM public.meetings
                ORDER BY id
                """,
            ),
            "participants": _dict_rows(
                self.db,
                """
                SELECT id::text AS id, provider_config, stack_ids, generation_policy, created_at
                FROM public.ai_participants
                ORDER BY id
                """,
            ),
            "messages": _dict_rows(
                self.db,
                """
                SELECT id::text AS id, content, citations, tool_artifacts, thinking_content,
                       estimated_cost, effective_generation, created_at
                FROM public.messages
                ORDER BY id
                """,
            ),
            "documents": _dict_rows(
                self.db,
                """
                SELECT id::text AS id, status, error_message, file_size_bytes, chunk_count
                FROM public.documents
                ORDER BY id
                """,
            ),
            "inference_events": _dict_rows(
                self.db,
                """
                SELECT id::text AS id, estimated_cost, usage_kind, price_kind, reported_cost
                FROM public.inference_events
                ORDER BY id
                """,
            ),
        }

    def unknown_legacy_assignments_are_marked_unknown(self) -> dict[str, Any]:
        participant = _dict_rows(
            self.db,
            """
            SELECT id::text AS id, stack_ids, generation_policy
            FROM public.ai_participants
            WHERE id = %s
            """,
            (PARTICIPANT_LEGACY_NULL,),
        )[0]
        message = _dict_rows(
            self.db,
            """
            SELECT id::text AS id, effective_generation
            FROM public.messages
            WHERE id = %s
            """,
            (MESSAGE_AI,),
        )[0]
        return {"participant": participant, "message": message}

    def missing_originals_are_marked_unavailable(self) -> list[dict[str, Any]]:
        return _dict_rows(
            self.db,
            """
            SELECT d.id::text AS document_id, d.status AS document_status,
                   r.status AS revision_status, r.source_key,
                   r.error_message
            FROM public.documents AS d
            JOIN public.document_revisions AS r ON r.document_id = d.id
            WHERE d.id IN (%s, %s, %s)
            ORDER BY d.id
            """,
            (DOCUMENT_INDEXED, DOCUMENT_PROCESSING, DOCUMENT_FAILED),
        )
