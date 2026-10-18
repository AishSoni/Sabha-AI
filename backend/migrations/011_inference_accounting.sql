-- Spec 02: universal inference ledger.
--
-- Every completed inference attempt (turn rounds, votes, summaries, forced
-- summaries) gets exactly one row here. The id is a stable identity generated
-- by the client of the RPC (usually the caller generated a uuid4 when the
-- attempt completed), which makes a retried submission idempotent: a repeated
-- submission is NOT double counted.
--
-- meetings.total_cost only moves through this ledger now; messages'
-- estimated_cost is informational display data. This migration deliberately
-- does NOT backfill from historical messages (legacy upgrade paths keep their
-- old totals; no recount of past message costs).
--
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS record_inference_cost(UUID, UUID, TEXT, TEXT, TEXT, DECIMAL);
--   DROP TABLE IF EXISTS inference_events;

CREATE TABLE IF NOT EXISTS inference_events (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('turn', 'vote', 'summary', 'forced_summary')),
    provider TEXT,
    model TEXT,
    estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inference_events_meeting_id ON inference_events(meeting_id);

CREATE OR REPLACE FUNCTION record_inference_cost(
    p_inference_id UUID,
    p_meeting_id UUID,
    p_purpose TEXT,
    p_provider TEXT DEFAULT NULL,
    p_model TEXT DEFAULT NULL,
    p_cost DECIMAL DEFAULT 0.0
)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO inference_events (id, meeting_id, purpose, provider, model, estimated_cost)
    VALUES (p_inference_id, p_meeting_id, p_purpose, p_provider, p_model, COALESCE(p_cost, 0.0))
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
        UPDATE meetings
        SET total_cost = total_cost + COALESCE(p_cost, 0.0)
        WHERE id = p_meeting_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
