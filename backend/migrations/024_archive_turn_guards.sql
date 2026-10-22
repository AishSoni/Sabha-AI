-- Archive is an overlay on the lifecycle axis (spec 08).
--
-- Admission and claiming must treat an archived meeting as closed even while
-- its persisted lifecycle status is active. These replacements are the only
-- change to the spec-07 queue functions: the earlier bodies are preserved
-- verbatim apart from the archive checks.

CREATE OR REPLACE FUNCTION public.admit_turn_operation(
    p_meeting_id UUID,
    p_participant_id UUID,
    p_request_key TEXT,
    p_payload_hash TEXT,
    p_payload JSONB,
    p_max_queued INTEGER,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_status TEXT;
    v_archived TIMESTAMPTZ;
    v_row public.operations;
    v_existing public.operations;
    v_queued INTEGER;
    v_position INTEGER;
BEGIN
    SELECT status, archived_at INTO v_status, v_archived
    FROM public.meetings
    WHERE id = p_meeting_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_status <> 'active' OR v_archived IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'meeting_closed');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.ai_participants
        WHERE id = p_participant_id AND meeting_id = p_meeting_id
    ) THEN
        RETURN jsonb_build_object('outcome', 'participant_not_found');
    END IF;

    SELECT * INTO v_existing
    FROM public.operations
    WHERE request_key = p_request_key;

    IF FOUND THEN
        IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash THEN
            RETURN jsonb_build_object(
                'outcome', 'conflict',
                'operation_id', v_existing.id
            );
        END IF;
        v_position := CASE WHEN v_existing.status = 'pending' THEN (
            SELECT COUNT(*) FROM public.operations q
            WHERE q.meeting_id = v_existing.meeting_id
              AND q.status = 'pending'
              AND q.admission <= v_existing.admission
        ) ELSE NULL END;
        RETURN jsonb_build_object(
            'outcome', 'existing',
            'operation', to_jsonb(v_existing),
            'queue_position', v_position
        );
    END IF;

    SELECT COUNT(*) INTO v_queued
    FROM public.operations
    WHERE meeting_id = p_meeting_id AND status = 'pending';

    IF v_queued >= COALESCE(p_max_queued, 10) THEN
        RETURN jsonb_build_object('outcome', 'queue_limit');
    END IF;

    INSERT INTO public.operations (
        request_key, claimant, status, meeting_id, participant_id,
        kind, payload_hash, payload, created_at, updated_at
    ) VALUES (
        p_request_key, NULL, 'pending', p_meeting_id, p_participant_id,
        'turn', p_payload_hash, p_payload, p_now, p_now
    )
    ON CONFLICT (request_key) DO NOTHING
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        SELECT * INTO v_existing
        FROM public.operations
        WHERE request_key = p_request_key;

        IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash THEN
            RETURN jsonb_build_object(
                'outcome', 'conflict',
                'operation_id', v_existing.id
            );
        END IF;
        v_position := CASE WHEN v_existing.status = 'pending' THEN (
            SELECT COUNT(*) FROM public.operations q
            WHERE q.meeting_id = v_existing.meeting_id
              AND q.status = 'pending'
              AND q.admission <= v_existing.admission
        ) ELSE NULL END;
        RETURN jsonb_build_object(
            'outcome', 'existing',
            'operation', to_jsonb(v_existing),
            'queue_position', v_position
        );
    END IF;

    INSERT INTO public.operation_events (
        id, operation_id, meeting_id, type, payload, created_at
    ) VALUES (
        gen_random_uuid(), v_row.id, p_meeting_id, 'status',
        jsonb_build_object('status', 'queued'), p_now
    );

    v_position := (
        SELECT COUNT(*) FROM public.operations q
        WHERE q.meeting_id = p_meeting_id
          AND q.status = 'pending'
          AND q.admission <= v_row.admission
    );

    RETURN jsonb_build_object(
        'outcome', 'created',
        'operation', to_jsonb(v_row),
        'queue_position', v_position
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.claim_next_turn_operation(
    p_claimant TEXT,
    p_lease_seconds INTEGER,
    p_global_limit INTEGER,
    p_now TIMESTAMPTZ,
    p_meeting_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_row public.operations;
    v_processing INTEGER;
    v_boundary BIGINT;
    v_candidate_id UUID;
    v_meeting_id UUID;
    v_attempts INTEGER := 0;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('sabha_turn_claim')::bigint);

    LOOP
        v_attempts := v_attempts + 1;
        IF v_attempts > 50 THEN
            RETURN NULL;
        END IF;

        SELECT COUNT(*) INTO v_processing
        FROM public.operations
        WHERE status = 'processing' AND meeting_id IS NOT NULL;

        IF v_processing >= COALESCE(p_global_limit, 1) THEN
            RETURN NULL;
        END IF;

        SELECT o.id, o.meeting_id
        INTO v_candidate_id, v_meeting_id
        FROM public.operations o
        JOIN public.meetings m ON m.id = o.meeting_id
        JOIN public.ai_participants p ON p.id = o.participant_id
        WHERE o.status = 'pending'
          AND m.status = 'active'
          AND m.archived_at IS NULL
          AND (p_meeting_id IS NULL OR o.meeting_id = p_meeting_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.operations x
              WHERE x.meeting_id = o.meeting_id AND x.status = 'processing'
          )
        ORDER BY o.admission
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN NULL;
        END IF;

        PERFORM 1 FROM public.meetings
        WHERE id = v_meeting_id
        FOR UPDATE;

        -- Closing or archiving may have won the meeting lock while this
        -- claim waited. Waiting work is their responsibility; this worker
        -- simply stops instead of executing against a closed meeting.
        IF NOT EXISTS (
            SELECT 1 FROM public.meetings
            WHERE id = v_meeting_id
              AND status = 'active'
              AND archived_at IS NULL
        ) THEN
            RETURN NULL;
        END IF;

        SELECT o.* INTO v_row
        FROM public.operations o
        WHERE o.id = v_candidate_id
          AND o.status = 'pending'
          AND NOT EXISTS (
              SELECT 1 FROM public.operations x
              WHERE x.meeting_id = o.meeting_id AND x.status = 'processing'
          )
        FOR UPDATE OF o SKIP LOCKED;

        IF FOUND THEN
            EXIT;
        END IF;
    END LOOP;

    SELECT COALESCE(MAX(sequence), 0) INTO v_boundary
    FROM public.messages
    WHERE meeting_id = v_meeting_id;

    UPDATE public.operations
    SET status = 'processing',
        claimant = p_claimant,
        fence_version = fence_version + 1,
        lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        started_at = COALESCE(started_at, p_now),
        updated_at = p_now,
        context_boundary = v_boundary,
        cancel_requested_at = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    INSERT INTO public.operation_events (
        id, operation_id, meeting_id, type, payload, created_at
    ) VALUES (
        gen_random_uuid(), v_row.id, v_row.meeting_id, 'status',
        jsonb_build_object('status', 'executing'), p_now
    );

    RETURN to_jsonb(v_row);
END;
$$;


DO $$
BEGIN
    REVOKE ALL ON FUNCTION public.admit_turn_operation(
        UUID, UUID, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ
    ) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.claim_next_turn_operation(
        TEXT, INTEGER, INTEGER, TIMESTAMPTZ, UUID
    ) FROM PUBLIC;

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.admit_turn_operation(
            UUID, UUID, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ
        ) FROM anon;
        REVOKE ALL ON FUNCTION public.claim_next_turn_operation(
            TEXT, INTEGER, INTEGER, TIMESTAMPTZ, UUID
        ) FROM anon;
    END IF;

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.admit_turn_operation(
            UUID, UUID, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ
        ) FROM authenticated;
        REVOKE ALL ON FUNCTION public.claim_next_turn_operation(
            TEXT, INTEGER, INTEGER, TIMESTAMPTZ, UUID
        ) FROM authenticated;
    END IF;

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.admit_turn_operation(
            UUID, UUID, TEXT, TEXT, JSONB, INTEGER, TIMESTAMPTZ
        ) TO service_role;
        GRANT EXECUTE ON FUNCTION public.claim_next_turn_operation(
            TEXT, INTEGER, INTEGER, TIMESTAMPTZ, UUID
        ) TO service_role;
    END IF;
END;
$$;
