"""Pending vector-cleanup ledger and reconciliation (spec-02 B2).

Parent deletes (meeting, knowledge stack) must drop their vector
collections. A Qdrant outage must not block the SQL delete — the delete
route records a pending cleanup row BEFORE the destructive work, attempts
the vector deletion best-effort, and leaves the row for reconciliation on
failure. `reconcile_pending_vector_cleanups` retries exactly the recorded
collections (never another parent's) and resolves the row when the
collection is gone.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from app.platform.database import get_supabase

logger = logging.getLogger(__name__)

_keeper: Optional["VectorCleanupLedger"] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class VectorCleanupLedger:
    """Durable reminder buffer between SQL deletes and vector-store work."""

    @property
    def db(self):
        return get_supabase()

    async def record(self, collection_name: str, target_kind: str, target_id: str | None) -> str:
        """Record a pending cleanup; returns the ledger row id."""
        result = self.db.table("pending_vector_cleanup").insert({
            "collection_name": collection_name,
            "target_kind": target_kind,
            "target_id": target_id,
        }).execute()
        return result.data[0]["id"]

    async def pending_items(self) -> list[dict]:
        result = self.db.table("pending_vector_cleanup")\
            .select("*")\
            .is_("resolved_at", None)\
            .execute()
        return list(result.data or [])

    async def record_attempt(self, item_id: str) -> None:
        """Count one reconciliation touch on this item."""
        current = self.db.table("pending_vector_cleanup")\
            .select("attempts")\
            .eq("id", item_id)\
            .single()\
            .execute()
        attempts = int((current.data or {}).get("attempts") or 0)
        self.db.table("pending_vector_cleanup").update({
            "attempts": attempts + 1,
        }).eq("id", item_id).execute()

    async def set_last_error(self, item_id: str, error: str) -> None:
        self.db.table("pending_vector_cleanup").update({
            "last_error": error,
        }).eq("id", item_id).execute()

    async def resolve(self, item_id: str) -> None:
        self.db.table("pending_vector_cleanup").update({
            "resolved_at": _now(),
            "last_error": None,
        }).eq("id", item_id).execute()


def get_vector_cleanup_ledger() -> VectorCleanupLedger:
    global _keeper
    if _keeper is None:
        _keeper = VectorCleanupLedger()
    return _keeper


async def reconcile_pending_vector_cleanups(
    vector_store=None,
    ledger: VectorCleanupLedger | None = None,
) -> dict:
    """Retry every pending cleanup once. Returns a small summary.

    Per item: attempts += 1; on success the row is resolved (resolved_at set,
    last_error cleared), on failure last_error is recorded and the row stays
    pending for the next pass. One poisoned item never stops the pass.
    """
    if vector_store is None:
        from app.services.vector_store import get_vector_store
        vector_store = get_vector_store()
    ledger = ledger or get_vector_cleanup_ledger()

    items = await ledger.pending_items()
    resolved = 0
    for item in items:
        collection_name = item["collection_name"]
        await ledger.record_attempt(item["id"])
        try:
            await vector_store.delete_collection(collection_name)
        except Exception as exc:  # noqa: BLE001 - one poisoned item must not stop the pass
            await ledger.set_last_error(item["id"], str(exc))
            logger.warning("Vector cleanup failed for %s: %s", collection_name, exc)
            continue
        await ledger.resolve(item["id"])
        resolved += 1
    return {"attempted": len(items), "resolved": resolved}


async def record_pending_cleanup(
    collection_name: str,
    target_kind: str,
    target_id: str | None = None,
) -> str:
    """Module-level convenience for tests/reconciliation replay."""
    return await get_vector_cleanup_ledger().record(collection_name, target_kind, target_id)
