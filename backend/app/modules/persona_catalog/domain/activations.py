"""Activation outcomes for the persona prompt catalog.

Business refusals are values here, not exceptions: an activation the
catalog refuses (unknown persona or unknown version) answers with
``PromptSelectionRefused`` so the use case stays a pure decision step and
presentation maps the typed outcome to its HTTP error. Infrastructure
failures never become these types; they propagate as raised exceptions.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptSelectionActivated:
    """The persona's active prompt version changed to ``version``."""

    persona_id: str
    version: int


@dataclass(frozen=True)
class PromptSelectionRefused:
    """The catalog refused the activation (unknown persona or unknown
    version); the previously active selection is untouched."""

    persona_id: str
    version: int
