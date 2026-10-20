-- Participant generation policy storage (spec 06).
--
-- Each participant captures an EXPLICIT-ONLY generation policy at
-- creation: recorded numbers stay recorded (an explicit zero included),
-- inherit markers never freeze into policy content, and inherited
-- fields resolve once at each turn's execution start instead of being
-- copied into columns at participant-creation time.
--
-- ADDITIVE — no backfill: rows created before this change keep their
-- provider_config verbatim and the new column stays NULL. NULL marks
-- legacy provenance ("carrier recorded before the policy column
-- existed"); legacy rows resolve their settings through provider_config
-- exactly as before, and no documented default is ever reinterpreted as
-- an explicit override those participants never made.

ALTER TABLE ai_participants
    ADD COLUMN IF NOT EXISTS generation_policy JSONB;

-- Meeting creation RPC gains the policy column. Legacy callers whose
-- participant payloads do not carry the key keep writing NULL.
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
        INSERT INTO ai_participants (id, meeting_id, name, role, system_prompt, provider_config, color, persona_id, stack_ids, generation_policy, created_at)
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
            v_entry->'generation_policy',
            COALESCE((v_entry->>'created_at')::timestamptz, NOW())
        )
        RETURNING to_jsonb(ai_participants) INTO v_row;
        v_participants := v_participants || v_row;
    END LOOP;

    RETURN jsonb_build_object('meeting', v_meeting, 'participants', v_participants);
END;
$$;

-- Keep the migration-013 execution-rights posture for the replaced
-- function: backend service role only, never anonymous browser clients.
REVOKE ALL ON FUNCTION create_meeting_transaction(JSONB, JSONB) FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION create_meeting_transaction(JSONB, JSONB) FROM anon';
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION create_meeting_transaction(JSONB, JSONB) FROM authenticated';
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION create_meeting_transaction(JSONB, JSONB) TO service_role';
    END IF;
END $$;
