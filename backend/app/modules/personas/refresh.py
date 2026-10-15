"""Refresh preview/apply with revision guards + meeting eligibility (P05-T04)."""

from __future__ import annotations


class RefreshConflict(ValueError):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def preview_refresh(*, participant: dict, persona: dict, expected_persona_revision: int | None = None) -> dict:
    current_rev = int(participant.get("persona_revision") or 0)
    target_rev = int(persona.get("revision") or 1)
    if expected_persona_revision is not None and int(expected_persona_revision) != target_rev:
        raise RefreshConflict("revision_mismatch")
    changes: dict = {}
    if (participant.get("persona_version") != persona.get("active_prompt_version")):
        changes["prompt_version"] = {
            "from": participant.get("persona_version"),
            "to": persona.get("active_prompt_version"),
        }
    if (participant.get("provider_config") or {}) != (persona.get("provider_config") or {}):
        changes["provider_config"] = {
            "from": participant.get("provider_config"),
            "to": persona.get("provider_config"),
        }
    if set(participant.get("stack_ids") or []) != set(persona.get("stack_ids") or []):
        changes["stacks"] = {
            "from": participant.get("stack_ids") or [],
            "to": persona.get("stack_ids") or [],
        }
    return {
        "participant_id": participant.get("id"),
        "persona_id": persona.get("id"),
        "current_persona_revision": current_rev,
        "target_persona_revision": target_rev,
        "changes": changes,
        "eligible": True,
    }


def require_refresh_eligible(
    *,
    meeting_status: str,
    has_active_work: bool = False,
    pending_queue: int = 0,
    participant_revision: int = 1,
    expected_participant_revision: int | None = None,
) -> None:
    if meeting_status != "active":
        raise RefreshConflict("meeting_not_active")
    if has_active_work:
        raise RefreshConflict("turn_in_progress")
    if pending_queue:
        raise RefreshConflict("queue_not_drained")
    if expected_participant_revision is not None and int(expected_participant_revision) != int(participant_revision):
        raise RefreshConflict("revision_mismatch")


def apply_refresh(
    *,
    participant: dict,
    persona: dict,
    snapshot: dict,
    expected_participant_revision: int | None = None,
    expected_persona_revision: int | None = None,
) -> dict:
    require_refresh_eligible(
        meeting_status="active",
        participant_revision=int(participant.get("snapshot_revision") or 1),
        expected_participant_revision=expected_participant_revision,
    )
    preview = preview_refresh(
        participant=participant, persona=persona,
        expected_persona_revision=expected_persona_revision,
    )
    if not preview["changes"]:
        return dict(participant)
    updated = dict(participant)
    updated.update({
        "system_prompt": snapshot["system_prompt"],
        "provider_config": snapshot["provider_config"],
        "effective_provider": snapshot.get("effective_provider"),
        "persona_version": snapshot.get("persona_version"),
        "persona_revision": snapshot.get("persona_revision", persona.get("revision", 1)),
        "stack_ids": snapshot.get("stack_ids", []),
        "snapshot_revision": int(participant.get("snapshot_revision") or 1) + 1,
    })
    return updated
