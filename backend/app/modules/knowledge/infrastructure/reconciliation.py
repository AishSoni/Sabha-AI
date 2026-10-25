"""Startup reconciliation for interrupted document lifecycles.

Policies (spec-02 decisions, documented here as the authoritative record):

- Byte retention across restarts is **not supported**. An upload whose
  ingestion was interrupted (crash/restart between "acknowledge upload" and
  "publication") leaves a documents row stuck in 'processing'. At startup such
  rows are honestly marked 'failed' with an actionable re-upload message —
  replaying durable ingestion is a Phase 2 project (spec 09).
- Deletions whose Qdrant collection cleanup failed are retried from the
  pending_vector_cleanup ledger until they are resolved (or keep failing with
  their last error recorded for diagnosis).

This pass runs from the app lifespan. It never raises: reconciliation issues
are logged loudly and retried on the next startup.
"""

import logging

from app.platform.database import get_supabase

logger = logging.getLogger(__name__)

# Actionable, operator-facing message stored on documents that can never
# complete on their own. Kept stable on purpose: diagnostics and maybe-indexed
# tooling match on "re-upload".
ORPHANED_INGESTION_MESSAGE = (
    "Ingestion was interrupted by a server restart and the file bytes were not "
    "retained. The document was never indexed; please re-upload the file."
)


async def reconcile_startup_state(vector_store=None, ledger=None) -> dict:
    """Recover from interrupted ingestion work after a restart.

    Returns a summary: {"documents_failed": n, "cleanups_attempted": a,
    "cleanups_resolved": r}. Database/vector-store outages degrade the pass
    into a warning instead of failing startup.
    """
    summary = {"documents_failed": 0, "cleanups_attempted": 0, "cleanups_resolved": 0}

    client = get_supabase()
    try:
        rows = client.table("documents").select("id").eq("status", "processing").execute().data or []
    except Exception as exc:  # noqa: BLE001 - a missed pass retried next startup
        logger.warning("Startup reconciliation could not read documents: %s", exc)
        rows = []
    for row in rows:
        if not isinstance(row, dict) or "id" not in row:
            continue
        try:
            client.table("documents").update(
                {"status": "failed", "error_message": ORPHANED_INGESTION_MESSAGE}
            ).eq("id", row["id"]).execute()
            summary["documents_failed"] += 1
        except Exception as exc:  # noqa: BLE001 - keep failing on the row, retry next startup
            logger.warning("Could not mark orphaned document %s failed: %s", row["id"], exc)

    try:
        from app.modules.knowledge.infrastructure.vector_cleanup import (
            reconcile_pending_vector_cleanups,
        )

        cleanup = await reconcile_pending_vector_cleanups(vector_store=vector_store, ledger=ledger)
        summary["cleanups_attempted"] = cleanup["attempted"]
        summary["cleanups_resolved"] = cleanup["resolved"]
    except Exception as exc:  # noqa: BLE001 - pending rows are simply retried
        logger.warning("Pending vector cleanup pass failed: %s", exc)

    return summary
