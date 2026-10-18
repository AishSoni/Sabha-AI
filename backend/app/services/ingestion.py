"""In-flight ingestion coordination (spec-02, operations-scope package B1).

The upload endpoint spends a background task per document. A racing delete of
the same document must fence that ingestion, because Qdrant points outlive
every SQL state change:

1. The delete route tombstones the document FIRST (before it deletes vector
   points or the SQL row). A tombstone is observable by in-flight ingestion.
2. Ingestion fences BEFORE publishing: a tombstoned document never upserts.
3. Ingestion fences AFTER publishing: if the tombstone landed between the
   pre-publish fence and the post-publish check, the just-published points
   are compensated away immediately.

Fences are the durable boundary of guarantee: no interleaving of upload and
delete can leave points of a deleted document alive. The registry holds one
`IngestionTicket` per document id; tickets are intentionally volatile
(in-process), because a restarted process cannot fence a task it never knew
about — startup reconciliation covers the leftover `processing` rows honestly.
"""

import asyncio
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class DocumentDeletedError(RuntimeError):
    """Raised when ingestion observes its document was tombstoned."""


class IngestionTicket:
    """One in-flight ingestion, fenced by a tombstone flag.

    `block_publish()` arms a gate the pipeline waits on before publishing.
    Production never arms it; tests use it to park ingestion in a
    deterministic window (the `indexing_barrier` fixture contract).
    """

    def __init__(self, document_id: str):
        self.document_id = document_id
        self._deleted = False
        self._gate: Optional[asyncio.Event] = None

    @property
    def deleted(self) -> bool:
        return self._deleted

    def tombstone(self) -> None:
        """Mark the document deleted (idempotent) and release the gate so a
        parked fence wakes up and observes the tombstone."""
        self._deleted = True
        if self._gate is not None:
            self._gate.set()

    def block_publish(self) -> asyncio.Event:
        """Test hook: park the publish fence on a gate. Returns the event the
        fence waits on; `set()` it to let ingestion continue."""
        if self._gate is None:
            self._gate = asyncio.Event()
        return self._gate

    async def await_publishable(self) -> None:
        """Pre-publish fence: raise `DocumentDeletedError` once the document
        is tombstoned; otherwise (after any parked gate is released) return."""
        if self._gate is not None:
            await self._gate.wait()
        if self._deleted:
            raise DocumentDeletedError(
                f"Document {self.document_id} was deleted during ingestion"
            )


class IngestionRegistry:
    """Ticket registry mapping document ids to their in-flight ingestion.

    Volatile by design: tombstones protect against deletes that race ingestion
    within one process lifetime. Restarting while a document sits in
    `processing` leaves nothing to fence — startup reconciliation marks those
    rows failed with a re-upload message instead (honest failure policy).
    """

    def __init__(self) -> None:
        self._tickets: Dict[str, IngestionTicket] = {}

    def create_ticket(self, document_id: str) -> IngestionTicket:
        ticket = IngestionTicket(document_id)
        self._tickets[document_id] = ticket
        return ticket

    def ticket_for(self, document_id: str) -> Optional[IngestionTicket]:
        return self._tickets.get(document_id)

    def mark_tombstone(self, document_id: str) -> None:
        """Tombstone the document's in-flight ingestion (if any)."""
        ticket = self._tickets.get(document_id)
        if ticket is not None:
            ticket.tombstone()


_registry: Optional[IngestionRegistry] = None


def get_ingestion_registry() -> IngestionRegistry:
    """Get or create the process-wide ingestion registry."""
    global _registry
    if _registry is None:
        _registry = IngestionRegistry()
    return _registry
