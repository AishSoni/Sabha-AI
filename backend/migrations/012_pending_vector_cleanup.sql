-- Pending vector cleanup ledger (spec-02 B2).
--
-- Deleting a meeting / knowledge stack must also delete its Qdrant
-- collection (`meeting_{id}_shared`, `stack_{id}_knowledge`). A transient
-- Qdrant outage must not block the SQL delete — so the route records a
-- pending cleanup FIRST, attempts the vector deletion best-effort, and,
-- when it fails, leaves this row behind for the next startup
-- reconciliation pass (never recount… never another parent's collection).
--
-- rows hold: which collection to drop, to whom it belonged, retries so far,
-- the last error, and when the work finished. There is deliberately no
-- backfill from historical data: old orphan collections from before this
-- ledger existed are out of scope (documented limitation).

CREATE TABLE IF NOT EXISTS pending_vector_cleanup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_name TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('meeting', 'stack', 'document')),
    target_id UUID,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_vector_cleanup_pending
    ON pending_vector_cleanup (created_at)
    WHERE resolved_at IS NULL;
