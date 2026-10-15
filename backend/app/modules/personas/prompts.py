"""Prompt composition + transactional helpers (P05-T02/T03).

BASE_INSTRUCTION is the immutable meeting contract. Persona extensions are
versioned separately so edits never rewrite history and snapshots stay
stable until an explicit refresh.
"""

from __future__ import annotations

BASE_INSTRUCTION = (
    "You are a participant in a multi-agent advisory board meeting called \"Sabha\".\n"
    "Stay in character, be concise, and use tools before speaking when facts are needed."
)


def split_prompt(full_prompt: str | None) -> dict:
    """Split stored system_prompt into base + extension for provenance."""
    full = full_prompt or ""
    if full.startswith(BASE_INSTRUCTION):
        return {
            "base_instruction": BASE_INSTRUCTION,
            "persona_extension": full[len(BASE_INSTRUCTION):].lstrip("\n"),
        }
    return {"base_instruction": BASE_INSTRUCTION, "persona_extension": full}


def compose_prompt(extension: str | None) -> str:
    extension = (extension or "").strip()
    if not extension:
        return BASE_INSTRUCTION
    return f"{BASE_INSTRUCTION}\n\n{extension}"


def validate_activation_target(versions: list[dict], target_version: int) -> dict:
    """Validate before mutating: missing target must preserve active."""
    for row in versions:
        if int(row.get("version", -1)) == int(target_version):
            return row
    raise LookupError(f"prompt version {target_version} not found")


def next_version_number(existing_versions: list[int]) -> int:
    """Locked allocation helper: caller must hold persona lock/transaction."""
    return (max(existing_versions) if existing_versions else 0) + 1
