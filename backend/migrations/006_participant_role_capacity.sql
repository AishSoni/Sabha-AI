-- Participant role capacity + atomic meeting creation.
--
-- personas.subtitle is VARCHAR(200) but ai_participants.role was VARCHAR(50):
-- creating a meeting from a persona with a long subtitle crashed the whole
-- creation. Widen the column to match (upgrades below also run the fresh
-- schema's new definition), and persist meeting + participants in ONE
-- transaction so a failure anywhere rolls the whole creation back instead of
-- leaving an orphan meeting. Pre-validation (unknown personas) happens in the
-- application layer before any write.

-- Upgrades: widen participant roles without losing data.
ALTER TABLE ai_participants
    ALTER COLUMN role TYPE VARCHAR(200);

-- Fresh schema parity helper (idempotent for repeat applications).
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
        INSERT INTO ai_participants (id, meeting_id, name, role, system_prompt, provider_config, color, persona_id, created_at)
        VALUES (
            (v_entry->>'id')::uuid,
            (p_meeting->>'id')::uuid,
            v_entry->>'name',
            v_entry->>'role',
            COALESCE(v_entry->>'system_prompt', ''),
            v_entry->'provider_config',
            COALESCE(v_entry->>'color', '#6366f1'),
            (v_entry->>'persona_id')::uuid,
            COALESCE((v_entry->>'created_at')::timestamptz, NOW())
        )
        RETURNING to_jsonb(ai_participants) INTO v_row;
        v_participants := v_participants || v_row;
    END LOOP;

    RETURN jsonb_build_object('meeting', v_meeting, 'participants', v_participants);
END;
$$;
