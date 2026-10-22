"""Ports owned by the Knowledge application layer.

Ports are narrow, typed seams. They may raise only the typed errors defined
here so callers never depend on an SDK or HTTP exception.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO, Protocol


class SourceStoreError(Exception):
    """Base error for the original-byte source store."""


class SourceStoreUnavailable(SourceStoreError):
    """The store cannot be reached or is not configured."""


class SourceNotFound(SourceStoreError):
    """The requested source object does not exist."""


class SourceObjectTooLarge(SourceStoreError):
    """The source object exceeds the bounded read budget."""


@dataclass(frozen=True)
class StoredSource:
    """One object discovered under a storage prefix."""

    key: str
    size: int | None = None


class SourceStore(Protocol):
    """Persist and retrieve original upload bytes.

    Implementations must generate no keys and make no eligibility
    decisions: the caller owns deterministic keys and SQL is the
    authority for which revisions are eligible.
    """

    def ensure_ready(self) -> None:
        """Create/verify the configured bucket, or raise a typed error."""

    def put(
        self,
        key: str,
        stream: BinaryIO,
        *,
        content_type: str,
        max_bytes: int,
    ) -> None:
        """Write a staging object within the byte budget; idempotent per key."""

    def move(self, source_key: str, destination_key: str) -> None:
        """Finalize a staged object at its durable key."""

    def download(self, key: str, *, max_bytes: int) -> bytes:
        """Read a bounded object or raise a typed error."""

    def exists(self, key: str) -> bool:
        """Whether an object exists, without raising for 'missing'."""

    def delete(self, key: str) -> None:
        """Remove an object; deleting an already-missing key is a no-op."""

    def list_prefix(self, prefix: str, *, limit: int = 100) -> list[StoredSource]:
        """List the immediate children under a prefix."""
