"""Legacy-data audit: report invalid states and broken ownership mappings
before enforcement (R-12). Pure function over meeting rows so the same audit
runs against a sanitized clone in Postgres and against fixtures in tests.

No broad ownership backfill is ever performed: ownerless rows are reported as
quarantined, and archived rows without provable prior state stay blocked
until an owner maps them explicitly.
"""

from __future__ import annotations

from typing import Any

VALID_STATES = {"active", "voting", "ended", "archived"}


def audit_meetings(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Inspect raw meeting rows; never mutates. Returns invalid states,
    ownerless (quarantined) ids and archived rows with unknown provenance."""
    invalid_states: list[dict[str, Any]] = []
    ownerless: list[str] = []
    archived_unknown: list[str] = []
    for row in rows:
        meeting_id = str(row.get("id"))
        status = row.get("status")
        if status not in VALID_STATES:
            invalid_states.append({"id": meeting_id, "status": status})
        owner = row.get("user_id")
        if owner is None or str(owner).strip() == "":
            ownerless.append(meeting_id)
        if status == "archived" and not row.get("archived_from"):
            archived_unknown.append(meeting_id)
    return {
        "total": len(rows),
        "invalid_states": invalid_states,
        "ownerless_quarantined": ownerless,
        "archived_unknown_prior": archived_unknown,
        "clean": not invalid_states and not ownerless and not archived_unknown,
    }
