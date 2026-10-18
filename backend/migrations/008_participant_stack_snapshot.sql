-- Participant knowledge-scope snapshots.
--
-- Meeting participants previously resolved their knowledge-stack licenses
-- LIVE from the persona template join (persona_knowledge_stacks) on every
-- turn: editing or deleting the template retroactively changed which private
-- documents meeting participants could see, and deleting the template
-- destroyed the bindings entirely. Instead, each participant now carries a
-- SNAPSHOT of the stack assignments captured at participant creation.
-- Snapshot is authoritative when present; NULL (legacy rows created before
-- this change that were never backfilled) falls back to the template join.
-- Stack CONTENTS stay live: collections are still resolved from stack ids at
-- turn time, so new documents indexed into an assigned stack keep flowing.

ALTER TABLE ai_participants
    ADD COLUMN IF NOT EXISTS stack_ids JSONB;

-- One-time backfill: existing participants capture the template's CURRENT
-- assignments so upgrade no longer leaks later template edits into running
-- meetings. Participants without personas record an explicit empty snapshot.
UPDATE ai_participants p
SET stack_ids = agg.ids
FROM (
    SELECT
        p2.id AS part_id,
        COALESCE(
            (
                SELECT jsonb_agg(ks.stack_id ORDER BY ks.created_at)
                FROM persona_knowledge_stacks ks
                WHERE ks.persona_id = p2.persona_id
            ),
            '[]'::jsonb
        ) AS ids
    FROM ai_participants p2
) agg
WHERE p.id = agg.part_id;

-- Meeting creation RPC gains the snapshot column (fresh parity + upgrade).
-- Insert remains a single transaction: any failure rolls back the whole row.
CREATE OR REPLACE FUNCTION create_meeting_transaction(p_meeting JSONB, p_participants JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_participants JSONB := '[]'::jsonb;
    v_row JSONB;
    v_entry JSONB;
    v_meeting JSONB;
BEGIN
    INSERT INTO meetings (id, user_id, name, agenda, status, total_cost, created_at)
    VALUES (
        (p_meeting->>'id')::uuid,
        (p_meeting->>'user_id')::uuid,
        p_meeting->>'name',
        COALESCE(p_meeting->>'agenda', ''),
        COALESCE(p_meeting->>'status', 'active'),
        COALESCE((p_meeting->>'total_cost')::numeric, 0.0),
        COALESCE((p_meeting->>'created_at')::timestamptz, NOW())
    )
    RETURNING to_jsonb(meetings) INTO v_meeting;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb)) LOOP
        INSERT INTO ai_participants (id, meeting_id, name, role, system_prompt, provider_config, color, persona_id, stack_ids, created_at)
        VALUES (
            (v_entry->>'id')::uuid,
            (p_meeting->>'id')::uuid,
            v_entry->>'name',
            v_entry->>'role',
            COALESCE(v_entry->>'system_prompt', ''),
            v_entry->'provider_config',
            COALESCE(v_entry->>'color', '#6366f1'),
            (v_entry->>'persona_id')::uuid,
            v_entry->'stack_ids',
            COALESCE((v_entry->>'created_at')::timestamptz, NOW())
        )
        RETURNING to_jsonb(ai_participants) INTO v_row;
        v_participants := v_participants || v_row;
    END LOOP;

    RETURN jsonb_build_object('meeting', v_meeting, 'participants', v_participants);
END;
$$;
