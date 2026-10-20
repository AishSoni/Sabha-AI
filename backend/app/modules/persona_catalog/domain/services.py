"""Persona catalog domain services (spec 06).

Pure validation and mapping lives here: request shapes are checked
without persistence, ports or time — the application use cases fail
fast before any transport call.
"""

from __future__ import annotations

from typing import Iterable


class TemplateValidationFailed(ValueError):
    """A creation/update request is malformed at the domain level."""


def validate_template_request(
    name: str | None = None,
    subtitle: str | None = None,
    color: str | None = None,
    stack_ids: Iterable[str] | None = None,
) -> list[str]:
    """Validate the catalog invariants and return the deduped stack ids.

    Name must be present and short enough for the template title column;
    stack ids are deduped in order (a repeated id is one assignment, not
    an error). Color, when provided, must look like a hex swatch because
    the roster UI renders it as CSS.
    """
    problems: list[str] = []
    if name is not None:
        stripped = name.strip()
        if not stripped:
            problems.append("name must not be empty")
        if len(stripped) > 100:
            problems.append("name must be at most 100 characters")
    if subtitle is not None and len(subtitle) > 200:
        problems.append("subtitle must be at most 200 characters")
    if color is not None and not _is_hex_color(color):
        problems.append("color must be a hex swatch like #6366f1")
    if problems:
        raise TemplateValidationFailed("; ".join(problems))

    if stack_ids is None:
        return []
    return list(dict.fromkeys(stack_ids))


def _is_hex_color(value: str) -> bool:
    body = value.lstrip("#")
    return value.startswith("#") and len(body) in (6, 3) and all(
        c in "0123456789abcdefABCDEF" for c in body
    )
