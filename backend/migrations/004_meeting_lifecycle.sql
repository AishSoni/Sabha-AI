-- Phase 04 meeting-lifecycle expansion (additive; history is never rewritten).
--
-- Apply AFTER 002/003 on a sanitized clone first, verify the audit report,
-- then apply to the live database and switch command routing. Rollback is a
-- compatible application rollback: new tables are ignored by old readers and
-- pending queue entries are retained for reconciliation, never discarded.
-- Row-level-security hardening stays Phase 08: until then the application
-- layer (require_actor/owner_or_404) enforces ownership, and the RPCs below
-- run as SECURITY DEFINER so atomic commits do not depend on caller rights.

-- 1. Status repair: admit the voting/ended states the domain already defines.
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_status_check
    CHECK (status IN ('active', 'voting', 'ended', 'archived'));

-- 2. Archive provenance: new archives preserve their prior state. Pre-existing
-- archived rows backfill to 'unknown' and stay unrestorable until an owner
-- maps them explicitly; they are never silently reopened.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS archived_from TEXT;
UPDATE meetings SET archived_from = 'unknown'
    WHERE status = 'archived' AND archived_from IS NULL;

-- 3. Editable user-message queue. Dispatch transitions the entry and inserts
-- the message in one RPC (dispatch_queue_entry); the UNIQUE(message_id)
-- linkage plus the revision guard make redelivery idempotent.
CREATE TABLE IF NOT EXISTS queue_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL,
    seq BIGINT NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
    revision INT NOT NULL DEFAULT 1,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'dispatched', 'removed')),
    idempotency_key TEXT NOT NULL DEFAULT '',
    message_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (meeting_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_idem
    ON queue_entries (meeting_id, idempotency_key)
    WHERE idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_queue_pending
    ON queue_entries (meeting_id, seq) WHERE state = 'pending';

-- 4. Ending attempts, votes and usage ledger (failed attempts keep theirs).
CREATE TABLE IF NOT EXISTS ending_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    force_end BOOLEAN NOT NULL DEFAULT FALSE,
    roster_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    transcript_revision BIGINT NOT NULL DEFAULT 0,
    outcome TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (outcome IN ('in_progress', 'completed', 'rejected', 'failed')),
    summary TEXT,
    usage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (meeting_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ending_one_summary
    ON ending_attempts (meeting_id) WHERE outcome = 'completed';
CREATE TABLE IF NOT EXISTS ending_votes (
    attempt_id UUID NOT NULL REFERENCES ending_attempts(attempt_id)
        ON DELETE CASCADE,
    participant_id UUID NOT NULL,
    participant_name TEXT NOT NULL,
    vote TEXT NOT NULL CHECK (vote IN ('yes', 'no')),
    reason TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (attempt_id, participant_id)
);
CREATE TABLE IF NOT EXISTS usage_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('turn', 'ending')),
    ref_id TEXT NOT NULL,
    usage_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source, ref_id)
);

-- 5. Durable execution leases: one live reservation per meeting for a turn
-- or an ending attempt, with fencing tokens and expiries.
CREATE TABLE IF NOT EXISTS execution_leases (
    meeting_id UUID PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
    holder_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('turn', 'ending')),
    fencing_token BIGINT NOT NULL,
    generation INT NOT NULL DEFAULT 1,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    started_provider_work BOOLEAN NOT NULL DEFAULT FALSE,
    state TEXT NOT NULL DEFAULT 'claimed'
        CHECK (state IN ('claimed', 'running', 'terminal'))
);

-- 6. Atomic commits (replacing REST pseudo-transactions).

-- Ending commit: votes + attempt outcome + summary + usage + meeting status.
CREATE OR REPLACE FUNCTION commit_ending_attempt(
    p_attempt_id UUID, p_outcome TEXT, p_summary TEXT, p_usage JSONB
) RETURNS VOID AS $$
DECLARE
    v_meeting UUID;
BEGIN
    UPDATE ending_attempts
       SET outcome = p_outcome, summary = p_summary, usage_json = p_usage
     WHERE attempt_id = p_attempt_id AND outcome = 'in_progress'
    RETURNING meeting_id INTO v_meeting;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ending attempt already terminalized';
    END IF;
    INSERT INTO usage_ledger (meeting_id, source, ref_id, usage_json)
    VALUES (v_meeting, 'ending', p_attempt_id::text, p_usage)
    ON CONFLICT (source, ref_id) DO NOTHING;
    IF p_outcome = 'completed' THEN
        UPDATE meetings SET status = 'ended' WHERE id = v_meeting;
    ELSE
        UPDATE meetings SET status = 'active'
         WHERE id = v_meeting AND status = 'voting';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Queue dispatch: entry transition + message insert together.
CREATE OR REPLACE FUNCTION dispatch_queue_entry(
    p_entry_id UUID, p_message_id UUID
) RETURNS UUID AS $$
DECLARE
    v_meeting UUID;
    v_content TEXT;
BEGIN
    UPDATE queue_entries
       SET state = 'dispatched', message_id = p_message_id,
           revision = revision + 1, updated_at = NOW()
     WHERE entry_id = p_entry_id AND state = 'pending'
    RETURNING meeting_id, content INTO v_meeting, v_content;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'queue entry not pending';
    END IF;
    INSERT INTO messages (id, meeting_id, sender_type, sender_name, content,
                          estimated_cost, created_at)
    VALUES (p_message_id, v_meeting, 'user', 'User', v_content, 0, NOW());
    RETURN p_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Transactional meeting + initial participant creation.
CREATE OR REPLACE FUNCTION create_meeting_with_participants(
    p_meeting_id UUID, p_name TEXT, p_agenda TEXT, p_owner TEXT,
    p_participants JSONB
) RETURNS UUID AS $$
DECLARE
    row JSONB;
BEGIN
    INSERT INTO meetings (id, name, agenda, user_id, status, total_cost,
                          created_at)
    VALUES (p_meeting_id, p_name, p_agenda, p_owner, 'active', 0, NOW());
    FOR row IN SELECT * FROM jsonb_array_elements(p_participants) LOOP
        INSERT INTO ai_participants (id, meeting_id, name, role,
                                     system_prompt, provider_config, color,
                                     persona_id, created_at)
        VALUES (COALESCE((row->>'id')::uuid, gen_random_uuid()),
                p_meeting_id, row->>'name',
                COALESCE(row->>'role', 'AI Assistant'),
                COALESCE(row->>'system_prompt', ''),
                COALESCE(row->'provider_config',
                         '{"provider":"","model":"","temperature":0.7}'::jsonb),
                COALESCE(row->>'color', '#6366f1'),
                (row->>'persona_id')::uuid, NOW());
    END LOOP;
    RETURN p_meeting_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
