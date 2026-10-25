"""Compatibility seam for the prompt catalog.

The prompt definitions now live in the Meetings module. This module keeps
legacy imports working until the remaining callers move at A15.
"""

from app.modules.meetings.application.prompts import (  # noqa: F401
    ANALYST_PROMPT,
    BASE_SYSTEM_PROMPT,
    CTO_PROMPT,
    DEFAULT_ROSTER,
    INVESTOR_PROMPT,
    get_full_prompt,
)

__all__ = [
    "ANALYST_PROMPT",
    "BASE_SYSTEM_PROMPT",
    "CTO_PROMPT",
    "DEFAULT_ROSTER",
    "INVESTOR_PROMPT",
    "get_full_prompt",
]
