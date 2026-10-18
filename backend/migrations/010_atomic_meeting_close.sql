-- Atomic meeting-close commit
-- The end flow generates the executive summary OUTSIDE any database
-- transaction (paid inference must never hold a DB transaction). What must
-- be atomic is the final publication: persisting the ending message and
-- flipping the meeting status are ONE transaction — otherwise a crash or a
-- race leaves a half-committed ending (a voting meeting without its final
-- summary, or an ended meeting whose summary never landed).
--
-- CAS: the update only applies when the meeting is still in `p_from_status`
-- (usually 'voting' after entry serialization; 'active' preserves the force
-- path). When another writer already committed the ending, this call returns
-- FALSE and persists nothing — at most one committed ending and one final
-- summary message ever exist. Idempotently safe to re-run.
-- Applies to long-lived databases; fresh installs run this after
-- supabase_schema.sql (the function is CREATE OR REPLACE, so re-running is a
-- no-op by design).

CREATE OR REPLACE FUNCTION commit_meeting_ending(
    p_meeting_id UUID,
    p_from_status TEXT,
    p_content TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    committed BOOLEAN := FALSE;
BEGIN
    UPDATE meetings
    SET status = 'ended'
    WHERE id = p_meeting_id AND status = p_from_status;

    IF FOUND THEN
        -- Content is omitted only on the recovery path where an ending
        -- message already persisted (legacy crash / pre-check reuse);
        -- then just flip the status without duplicating the summary.
        IF p_content IS NOT NULL THEN
            INSERT INTO messages (meeting_id, sender_type, sender_name, content)
            VALUES (p_meeting_id, 'system', 'System', p_content);
        END IF;
        committed := TRUE;
    END IF;

    RETURN committed;
END;
$$ LANGUAGE plpgsql;
