-- Spec 20: consolidate hot meeting reads into one round trip.
--
-- `read_meeting_bundle` returns the meeting, its participants and its messages
-- in one JSONB document, with explicit columns (no `select *` payloads) and
-- messages ordered by the committed conversation sequence (index
-- `idx_messages_meeting_sequence`). `read_meeting_closing` reuses that bundle
-- and additionally folds vote attempt metadata and the active processing turn
-- start into the same call, so the closing reader no longer re-reads the
-- meeting or the attempt table.
--
-- Both functions are backend-only: they are revoked from PUBLIC, anon and
-- authenticated, and granted to service_role.

-- --------------------------------------------------------------------------
-- 1) Meeting bundle: meeting + participants + messages in one call.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_meeting_bundle(
    p_meeting_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting JSONB;
    v_participants JSONB;
    v_messages JSONB;
BEGIN
    SELECT to_jsonb(m)
    INTO v_meeting
    FROM (
        SELECT
            id,
            user_id,
            name,
            agenda,
            status,
            total_cost,
            created_at,
            archived_at
        FROM public.meetings
        WHERE id = p_meeting_id
    ) AS m;

    IF v_meeting IS NULL THEN
        RETURN jsonb_build_object(
            'meeting', NULL,
            'participants', '[]'::jsonb,
            'messages', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    INTO v_participants
    FROM (
        SELECT
            id,
            meeting_id,
            name,
            role,
            system_prompt,
            provider_config,
            color,
            created_at,
            persona_id,
            stack_ids,
            generation_policy
        FROM public.ai_participants
        WHERE meeting_id = p_meeting_id
    ) AS p;

    SELECT COALESCE(jsonb_agg(to_jsonb(msg) ORDER BY msg.sequence), '[]'::jsonb)
    INTO v_messages
    FROM (
        SELECT
            id,
            meeting_id,
            sender_type,
            sender_id,
            sender_name,
            content,
            citations,
            tool_artifacts,
            thinking_content,
            estimated_cost,
            created_at,
            sequence,
            operation_id,
            request_key,
            effective_generation
        FROM public.messages
        WHERE meeting_id = p_meeting_id
    ) AS msg;

    RETURN jsonb_build_object(
        'meeting', v_meeting,
        'participants', v_participants,
        'messages', v_messages
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 2) Closing read: bundle + closing + votes + attempt + processing start.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_meeting_closing(
    p_meeting_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_bundle JSONB;
    v_meeting JSONB;
    v_closing public.meeting_closings;
    v_votes JSONB;
    v_started_at TIMESTAMPTZ;
BEGIN
    v_bundle := public.read_meeting_bundle(p_meeting_id);
    v_meeting := v_bundle -> 'meeting';

    IF v_meeting IS NULL OR v_meeting = 'null'::jsonb THEN
        RETURN jsonb_build_object(
            'meeting', NULL,
            'closing', NULL,
            'votes', '[]'::jsonb,
            'participants', '[]'::jsonb,
            'messages', '[]'::jsonb,
            'processing_turn_started_at', NULL
        );
    END IF;

    SELECT COALESCE(execution_started_at, updated_at)
    INTO v_started_at
    FROM public.operations
    WHERE meeting_id = p_meeting_id
      AND status = 'processing'
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT *
    INTO v_closing
    FROM public.meeting_closings
    WHERE meeting_id = p_meeting_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'meeting', v_meeting,
            'closing', NULL,
            'votes', '[]'::jsonb,
            'participants', v_bundle -> 'participants',
            'messages', v_bundle -> 'messages',
            'processing_turn_started_at', v_started_at
        );
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'participant_id', v.participant_id,
                'participant_name', p.name,
                'role', p.role,
                'status', v.status,
                'vote', v.vote,
                'reason', v.reason,
                'provider', v.provider,
                'model', v.model,
                'settings', v.settings,
                'usage', v.usage,
                'usage_kind', v.usage_kind,
                'price_kind', v.price_kind,
                'estimated_cost', v.estimated_cost,
                'reported_cost', v.reported_cost,
                'error_code', v.error_code,
                'error_message', v.error_message,
                'attempt_id', v.attempt_id,
                'attempt_number', v.attempt_number,
                'attempt_lease_expires_at', v.attempt_lease_expires_at,
                'completed_at', v.completed_at
            )
            ORDER BY p.name
        ),
        '[]'::jsonb
    )
    INTO v_votes
    FROM public.closing_votes v
    JOIN public.ai_participants p ON p.id = v.participant_id
    WHERE v.closing_id = v_closing.id;

    RETURN jsonb_build_object(
        'meeting', v_meeting,
        'closing', to_jsonb(v_closing),
        'votes', v_votes,
        'participants', v_bundle -> 'participants',
        'messages', v_bundle -> 'messages',
        'processing_turn_started_at', v_started_at
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 3) Execution rights: backend service role only.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    target TEXT[] := ARRAY[
        'read_meeting_bundle',
        'read_meeting_closing'
    ];
    fn RECORD;
BEGIN
    FOR fn IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY(target)
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
