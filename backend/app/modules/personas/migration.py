"""Legacy persona/prompt audit before constraint enforcement (P05-T08)."""

from __future__ import annotations


def audit_prompt_versions(rows: list[dict]) -> dict:
    """Group prompt rows by persona; report multi-active / no-active.

    History is preserved; constraints are only safe after the report is
    resolved with a deterministic mapping or an explicit owner decision.
    """
    by_persona: dict[str, list[dict]] = {}
    for row in rows:
        by_persona.setdefault(str(row.get("persona_id")), []).append(row)
    multi_active, no_active, ok = [], [], []
    for persona_id, versions in by_persona.items():
        active = [v for v in versions if v.get("is_active")]
        if len(active) > 1:
            multi_active.append({
                "persona_id": persona_id,
                "active_versions": sorted(int(v.get("version", 0)) for v in active),
            })
        elif not active and versions:
            no_active.append({"persona_id": persona_id, "count": len(versions)})
        else:
            ok.append(persona_id)
    return {
        "personas": len(by_persona),
        "ok": ok,
        "multi_active": multi_active,
        "no_active": no_active,
        "safe_to_constrain": not multi_active and not no_active,
    }


def resolve_legacy_active(versions: list[dict]) -> dict | None:
    """Deterministic mapping: highest version wins; caller records decision."""
    if not versions:
        return None
    return max(versions, key=lambda v: int(v.get("version", 0)))
