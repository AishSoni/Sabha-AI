"""Participant snapshot creation (P05-T03, B-07).

Snapshots inherit the persona provider config, split base instruction from
the persona extension, and record provenance + revisions so later persona
edits never move an active meeting.
"""

from __future__ import annotations

from app.modules.personas.config import resolve_effective_config
from app.modules.personas.preferences import server_defaults
from app.modules.personas.prompts import compose_prompt, split_prompt


def build_participant_snapshot(
    *,
    persona: dict,
    active_prompt: str,
    stack_ids: list[str] | None = None,
    participant_overrides: dict | None = None,
    persona_revision: int = 1,
) -> dict:
    persona_cfg = dict(persona.get("provider_config") or {})
    overrides = dict(participant_overrides or {})
    effective = resolve_effective_config(
        participant=overrides or None,
        persona=persona_cfg or None,
        server=server_defaults(),
    )
    parts = split_prompt(active_prompt)
    # compose() normalizes whitespace; stored prompt is the composed form.
    system_prompt = compose_prompt(parts["persona_extension"])
    return {
        "name": persona.get("name", "AI Assistant"),
        "role": persona.get("subtitle") or "AI Assistant",
        "system_prompt": system_prompt,
        "base_instruction": parts["base_instruction"],
        "persona_extension": parts["persona_extension"],
        "provider_config": {
            "provider": effective.provider,
            "model": effective.model,
            "temperature": effective.temperature,
            "max_tokens": effective.max_tokens,
        },
        "effective_provider": {
            "provider": effective.provider,
            "model": effective.model,
            "temperature": effective.temperature,
            "max_tokens": effective.max_tokens,
            "provenance": effective.provenance,
        },
        "persona_version": persona.get("active_prompt_version"),
        "persona_revision": persona_revision,
        "snapshot_revision": 1,
        "stack_ids": list(stack_ids or []),
        "color": persona.get("color", "#6366f1"),
        "persona_id": persona.get("id"),
    }
