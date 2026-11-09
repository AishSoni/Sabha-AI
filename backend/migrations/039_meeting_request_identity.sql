-- Spec 36 / T04: a request key identifies one meeting-creation intent.
--
-- A committed meeting whose response was lost must be recoverable by replaying
-- the same key. Reusing the key for a different payload is a conflict, never a
-- second meeting or a silent acknowledgement of the old one.

ALTER TABLE public.meetings
    ADD COLUMN IF NOT EXISTS request_key TEXT,
    ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS one_meeting_per_request_key
    ON public.meetings (request_key)
    WHERE request_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_meeting_transaction(
    p_meeting JSONB,
    p_participants JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_participants JSONB := '[]'::jsonb;
    v_row JSONB;
    v_entry JSONB;
    v_meeting JSONB;
    v_existing public.meetings;
    v_request_key TEXT := NULLIF(p_meeting->>'request_key', '');
    v_fingerprint TEXT := NULLIF(p_meeting->>'request_fingerprint', '');
    v_user_id UUID := NULLIF(p_meeting->>'user_id', '')::uuid;
BEGIN
    IF v_request_key IS NOT NULL THEN
        SELECT * INTO v_existing FROM public.meetings
        WHERE request_key = v_request_key;

        IF FOUND THEN
            IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
                OR v_existing.user_id IS DISTINCT FROM v_user_id THEN
                RETURN jsonb_build_object('outcome', 'conflict');
            END IF;

            SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at, p.id), '[]'::jsonb)
            INTO v_participants
            FROM public.ai_participants p
            WHERE p.meeting_id = v_existing.id;

            RETURN jsonb_build_object(
                'outcome', 'existing',
                'meeting', to_jsonb(v_existing),
                'participants', v_participants
            );
        END IF;
    END IF;

    INSERT INTO public.meetings (
        id, user_id, name, agenda, status, total_cost, created_at,
        request_key, request_fingerprint
    )
    VALUES (
        COALESCE(NULLIF(p_meeting->>'id', '')::uuid, gen_random_uuid()),
        v_user_id,
        p_meeting->>'name',
        COALESCE(p_meeting->>'agenda', ''),
        COALESCE(p_meeting->>'status', 'active'),
        COALESCE((p_meeting->>'total_cost')::numeric, 0.0),
        COALESCE((p_meeting->>'created_at')::timestamptz, NOW()),
        v_request_key,
        v_fingerprint
    )
    ON CONFLICT (request_key)
        WHERE request_key IS NOT NULL
    DO NOTHING
    RETURNING to_jsonb(meetings) INTO v_meeting;

    IF v_meeting IS NULL THEN
        -- A concurrent replay committed first. Return that meeting only when
        -- it represents the same intent.
        SELECT * INTO v_existing FROM public.meetings
        WHERE request_key = v_request_key;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('outcome', 'conflict');
        END IF;

        IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint
            OR v_existing.user_id IS DISTINCT FROM v_user_id THEN
            RETURN jsonb_build_object('outcome', 'conflict');
        END IF;

        SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at, p.id), '[]'::jsonb)
        INTO v_participants
        FROM public.ai_participants p
        WHERE p.meeting_id = v_existing.id;

        RETURN jsonb_build_object(
            'outcome', 'existing',
            'meeting', to_jsonb(v_existing),
            'participants', v_participants
        );
    END IF;

    FOR v_entry IN
        SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb))
    LOOP
        INSERT INTO public.ai_participants (
            id, meeting_id, name, role, system_prompt, provider_config, color,
            persona_id, stack_ids, generation_policy, created_at
        )
        VALUES (
            (v_entry->>'id')::uuid,
            (v_meeting->>'id')::uuid,
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

    RETURN jsonb_build_object(
        'outcome', 'created',
        'meeting', v_meeting,
        'participants', v_participants
    );
END;
$$;

-- Keep the migration-013 execution-rights posture: backend service role only.
DO $$
DECLARE
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'create_meeting_transaction'
    LOOP
        EXECUTE format(
            'revoke all on function public.%I(%s) from public',
            fn.proname, fn.args
        );
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format(
                'revoke all on function public.%I(%s) from anon',
                fn.proname, fn.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format(
                'revoke all on function public.%I(%s) from authenticated',
                fn.proname, fn.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format(
                'grant execute on function public.%I(%s) to service_role',
                fn.proname, fn.args
            );
        END IF;
    END LOOP;
END $$;
