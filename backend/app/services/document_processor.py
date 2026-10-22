"""Compatibility shim for the pre-spec-09 parser import path.

Knowledge owns parsing now; this module keeps legacy callers (and their
tests) importable until the legacy route removal slice.
"""

from app.modules.knowledge.infrastructure.parsers import (  # noqa: F401
    MAX_EXTRACT_CHARACTERS,
    MAX_ROWS_PER_SHEET,
    DocumentChunk,
    DocumentProcessor,
    budgeted_rows,
)

__all__ = [
    "MAX_EXTRACT_CHARACTERS",
    "MAX_ROWS_PER_SHEET",
    "DocumentChunk",
    "DocumentProcessor",
    "budgeted_rows",
]
