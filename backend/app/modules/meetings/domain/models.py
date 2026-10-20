"""Meetings domain models (spec 06).

ParticipantSnapshot is one participant's construction-time truth: a
participant is an INDEPENDENT COPY of its template state, taken once,
at construction — later template edits or deletion never re-read into
existing participants (proven by the persona-instances contract in
tests/regression/test_persona_instances_ab.py).

The generation carrier below is the participant's verbatim snapshot of
the template's provider_config: recorded values (including empty-string
inherit markers) pass through untouched, and keys the template never
recorded are ABSENT — the snapshot never seeds server defaults into an
override slot (that freezing is the spec-06 violation to remove).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Optional


GENERATION_CARRIER_KEYS = ("provider", "model", "temperature", "max_tokens")


def participant_provider_carrier(
    template_carrier: Mapping[str, Any] | None,
) -> dict:
    """Verbatim explicit-only snapshot of a template's settings carrier.

    Recorded numbers stay as-is (a ``0.7`` from a legacy seeded row stays
    ``0.7``, an explicit ``0.0`` stays ``0.0``); empty-string provider/
    model markers stay markers; JSON-null or missing keys are omitted so
    inheritance survives at execution start.
    """
    carrier = template_carrier or {}
    carried: dict = {}
    for key in GENERATION_CARRIER_KEYS:
        value = carrier.get(key)
        if value is not None:
            carried[key] = value
    return carried


def resolve_temperature(
    carrier: Mapping[str, Any] | None,
    default_temperature: float = 0.7,
) -> float:
    """Resolve a generation temperature from a participant carrier.

    Explicit recorded values win — including zero, which must never be
    reinterpreted as "no preference" — and only an absent/None entry
    falls through to the server default.
    """
    recorded = (carrier or {}).get("temperature")
    return default_temperature if recorded is None else float(recorded)


@dataclass(frozen=True)
class ParticipantSnapshot:
    """Everything one construction transactions writes for a participant."""

    id: str
    meeting_id: str
    name: str
    role: str
    system_prompt: str
    provider_config: dict
    color: str
    persona_id: Optional[str]
    stack_ids: tuple[str, ...]
    created_at: str
    # Explicit-only policy (inherit fields stay absent); every newly
    # constructed participant records the column ({} at minimum), so a
    # NULL column honest remains "legacy provenance".
    generation_policy: dict = field(default_factory=dict)

    def to_payload(self) -> dict:
        """Insert/RPC-ready mapping (tuples flattened to lists)."""
        return {
            "id": self.id,
            "meeting_id": self.meeting_id,
            "name": self.name,
            "role": self.role,
            "system_prompt": self.system_prompt,
            "provider_config": self.provider_config,
            "color": self.color,
            "persona_id": self.persona_id,
            "stack_ids": list(self.stack_ids),
            "created_at": self.created_at,
            "generation_policy": dict(self.generation_policy),
        }
