-- Durable turn queue RPCs (spec 07).
--
-- These functions are additive to the spec-04 claim_operation/publish_operation
-- primitive. They own admission, FIFO claiming, leases, fenced attempt and
-- publication state, durable events, cancellation and deduplicated effects.
--
-- Every function is SECURITY INVOKER with search_path='' and schema-qualified
-- names. No function holds a transaction across a provider call: callers claim
-- and commit, then invoke inference.

-- --------------------------------------------------------------------------
-- Admission: atomic validate + create-or-return, FIFO by operations.admission.
-- --------------------------------------------------------------------------

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
    v_row public.operations;
    v_existing public.operations;
    v_queued INTEGER;
    v_position INTEGER;
BEGIN
    SELECT status INTO v_status
    FROM public.meetings
    WHERE id = p_meeting_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_status <> 'active' THEN
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

-- --------------------------------------------------------------------------
-- Claim: one executing turn per meeting, global concurrency, FIFO admission.
-- --------------------------------------------------------------------------

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
BEGIN
    -- Claims are short. The advisory lock serializes the global limit and
    -- complements the one-executing-per-meeting unique index.
    PERFORM pg_advisory_xact_lock(hashtext('sabha_turn_claim')::bigint);

    SELECT COUNT(*) INTO v_processing
    FROM public.operations
    WHERE status = 'processing' AND meeting_id IS NOT NULL;

    IF v_processing >= COALESCE(p_global_limit, 1) THEN
        RETURN NULL;
    END IF;

    SELECT o.* INTO v_row
    FROM public.operations o
    JOIN public.meetings m ON m.id = o.meeting_id
    JOIN public.ai_participants p ON p.id = o.participant_id
    WHERE o.status = 'pending'
      AND m.status = 'active'
      AND (p_meeting_id IS NULL OR o.meeting_id = p_meeting_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.operations x
          WHERE x.meeting_id = o.meeting_id AND x.status = 'processing'
      )
    ORDER BY o.admission
    FOR UPDATE OF o SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(MAX(sequence), 0) INTO v_boundary
    FROM public.messages
    WHERE meeting_id = v_row.meeting_id;

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

-- --------------------------------------------------------------------------
-- Lease, start and recovery.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.renew_turn_operation_lease(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_lease_seconds INTEGER,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.operations
    SET lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        updated_at = p_now
    WHERE id = p_operation_id
      AND fence_version = p_expected_fence
      AND status = 'processing';

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_turn_operation(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_effective_settings JSONB,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.operations
    SET effective_settings = p_effective_settings,
        updated_at = p_now
    WHERE id = p_operation_id
      AND fence_version = p_expected_fence
      AND status = 'processing';

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_turn_operations(
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_row public.operations;
    v_requeued INTEGER := 0;
    v_interrupted INTEGER := 0;
    v_cancelled INTEGER := 0;
BEGIN
    FOR v_row IN
        SELECT * FROM public.operations
        WHERE status = 'processing'
          AND meeting_id IS NOT NULL
          AND (lease_expires_at IS NULL OR lease_expires_at < p_now)
        FOR UPDATE SKIP LOCKED
    LOOP
        IF v_row.execution_started_at IS NULL THEN
            UPDATE public.operations
            SET status = 'pending',
                claimant = NULL,
                lease_expires_at = NULL,
                context_boundary = NULL,
                updated_at = p_now
            WHERE id = v_row.id;

            INSERT INTO public.operation_events (
                id, operation_id, meeting_id, type, payload, created_at
            ) VALUES (
                gen_random_uuid(), v_row.id, v_row.meeting_id, 'status',
                jsonb_build_object(
                    'status', 'queued',
                    'reason', 'recovered_before_provider'
                ), p_now
            );
            v_requeued := v_requeued + 1;
        ELSE
            UPDATE public.operations
            SET status = 'interrupted',
                error_code = 'unknown_outcome',
                error_message = 'The provider call may have completed; retry explicitly.',
                completed_at = p_now,
                updated_at = p_now
            WHERE id = v_row.id;

            UPDATE public.operation_attempts
            SET status = 'unknown',
                error_code = 'unknown_outcome',
                completed_at = p_now
            WHERE operation_id = v_row.id AND status = 'started';

            INSERT INTO public.operation_events (
                id, operation_id, meeting_id, type, payload, created_at
            ) VALUES (
                gen_random_uuid(), v_row.id, v_row.meeting_id, 'interrupted',
                jsonb_build_object(
                    'code', 'unknown_outcome',
                    'message', 'The provider call may have completed; retry explicitly.'
                ), p_now
            );
            v_interrupted := v_interrupted + 1;
        END IF;
    END LOOP;

    -- Pending work whose meeting closed or participant disappeared can never
    -- execute. Make that transition explicit instead of leaving it queued.
    FOR v_row IN
        SELECT o.* FROM public.operations o
        LEFT JOIN public.meetings m ON m.id = o.meeting_id
        LEFT JOIN public.ai_participants p ON p.id = o.participant_id
        WHERE o.status = 'pending'
          AND o.meeting_id IS NOT NULL
          AND (m.status IS NULL OR m.status <> 'active' OR p.id IS NULL)
        FOR UPDATE OF o SKIP LOCKED
    LOOP
        UPDATE public.operations
        SET status = 'cancelled',
            error_code = CASE WHEN v_row.participant_id IS NULL
                THEN 'participant_removed' ELSE 'meeting_closed' END,
            error_message = 'The queued turn can no longer execute.',
            completed_at = p_now,
            cancelled_at = p_now,
            updated_at = p_now
        WHERE id = v_row.id;

        INSERT INTO public.operation_events (
            id, operation_id, meeting_id, type, payload, created_at
        ) VALUES (
            gen_random_uuid(), v_row.id, v_row.meeting_id, 'cancelled',
            jsonb_build_object(
                'code', CASE WHEN v_row.participant_id IS NULL
                    THEN 'participant_removed' ELSE 'meeting_closed' END,
                'message', 'The queued turn can no longer execute.'
            ), p_now
        );
        v_cancelled := v_cancelled + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'requeued', v_requeued,
        'interrupted', v_interrupted,
        'cancelled', v_cancelled
    );
END;
$$;

-- --------------------------------------------------------------------------
-- Attempts and usage: stable identity before every provider call.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_turn_attempt(
    p_operation_id UUID,
    p_attempt_id UUID,
    p_expected_fence INTEGER,
    p_provider TEXT,
    p_model TEXT,
    p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_existing public.operation_attempts;
    v_op public.operations;
    v_number INTEGER;
BEGIN
    SELECT * INTO v_existing
    FROM public.operation_attempts
    WHERE id = p_attempt_id;

    IF FOUND THEN
        RETURN v_existing.attempt_number;
    END IF;

    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN NULL;
    END IF;

    v_number := v_op.attempt_count + 1;

    UPDATE public.operations
    SET attempt_count = v_number,
        execution_started_at = COALESCE(execution_started_at, p_now),
        updated_at = p_now
    WHERE id = p_operation_id;

    INSERT INTO public.operation_attempts (
        id, operation_id, attempt_number, claimant, fence_version,
        status, provider, model, started_at
    ) VALUES (
        p_attempt_id, p_operation_id, v_number, v_op.claimant,
        p_expected_fence, 'started', p_provider, p_model, p_now
    );

    RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_turn_attempt(
    p_attempt_id UUID,
    p_usage JSONB,
    p_cost DECIMAL,
    p_provider_request_id TEXT,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_attempt public.operation_attempts;
    v_meeting_id UUID;
BEGIN
    SELECT * INTO v_attempt
    FROM public.operation_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_attempt.status = 'completed' THEN
        RETURN FALSE;
    END IF;

    IF v_attempt.status NOT IN ('started', 'unknown') THEN
        RETURN FALSE;
    END IF;

    SELECT meeting_id INTO v_meeting_id
    FROM public.operations
    WHERE id = v_attempt.operation_id;

    UPDATE public.operation_attempts
    SET status = 'completed',
        usage = COALESCE(p_usage, '{}'::jsonb),
        estimated_cost = COALESCE(p_cost, 0.0),
        provider_request_id = p_provider_request_id,
        completed_at = p_now
    WHERE id = p_attempt_id;

    INSERT INTO public.inference_events (
        id, meeting_id, purpose, provider, model,
        estimated_cost, operation_id, usage, created_at
    ) VALUES (
        p_attempt_id, v_meeting_id, 'turn', v_attempt.provider, v_attempt.model,
        COALESCE(p_cost, 0.0), v_attempt.operation_id,
        COALESCE(p_usage, '{}'::jsonb), p_now
    )
    ON CONFLICT (id) DO NOTHING;

    IF FOUND THEN
        UPDATE public.meetings
        SET total_cost = total_cost + COALESCE(p_cost, 0.0)
        WHERE id = v_meeting_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_turn_attempt(
    p_attempt_id UUID,
    p_status TEXT,
    p_error_code TEXT,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF p_status NOT IN ('failed', 'unknown') THEN
        RAISE EXCEPTION 'invalid attempt status: %', p_status;
    END IF;

    UPDATE public.operation_attempts
    SET status = p_status,
        error_code = p_error_code,
        completed_at = p_now
    WHERE id = p_attempt_id
      AND status IN ('started', 'unknown');

    RETURN FOUND;
END;
$$;

-- --------------------------------------------------------------------------
-- Publication and terminal transitions.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_turn_operation(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_message JSONB,
    p_usage JSONB,
    p_cost DECIMAL,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_message public.messages;
BEGIN
    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_op.status = 'done' AND v_op.final_message_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'outcome', 'already_published',
            'message_id', v_op.final_message_id
        );
    END IF;

    IF v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN jsonb_build_object('outcome', 'stale');
    END IF;

    IF v_op.cancel_requested_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'cancel_requested');
    END IF;

    INSERT INTO public.messages (
        id, meeting_id, sender_type, sender_id, sender_name, content,
        citations, tool_artifacts, thinking_content, estimated_cost,
        effective_generation, operation_id, created_at
    ) VALUES (
        (p_message->>'id')::uuid,
        v_op.meeting_id,
        'ai',
        NULLIF(p_message->>'sender_id', '')::uuid,
        COALESCE(p_message->>'sender_name', 'AI'),
        COALESCE(p_message->>'content', ''),
        COALESCE(p_message->'citations', '[]'::jsonb),
        p_message->'tool_artifacts',
        p_message->>'thinking_content',
        COALESCE((p_message->>'estimated_cost')::decimal, 0.0),
        p_message->'effective_generation',
        p_operation_id,
        p_now
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_message;

    IF NOT FOUND THEN
        SELECT * INTO v_message
        FROM public.messages
        WHERE operation_id = p_operation_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('outcome', 'message_conflict');
        END IF;
    END IF;

    UPDATE public.operations
    SET status = 'done',
        final_message_id = v_message.id,
        completed_at = p_now,
        updated_at = p_now
    WHERE id = p_operation_id;

    INSERT INTO public.operation_events (
        id, operation_id, meeting_id, type, payload, created_at
    ) VALUES (
        gen_random_uuid(), p_operation_id, v_op.meeting_id, 'done',
        jsonb_build_object(
            'message_id', v_message.id,
            'usage', COALESCE(p_usage, '{}'::jsonb),
            'estimated_cost', COALESCE(p_cost, 0.0)
        ), p_now
    );

    RETURN jsonb_build_object(
        'outcome', 'published',
        'message', to_jsonb(v_message)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_turn_operation(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_status TEXT,
    p_error_code TEXT,
    p_error_message TEXT,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_event_type TEXT;
BEGIN
    IF p_status NOT IN ('failed', 'interrupted', 'cancelled') THEN
        RAISE EXCEPTION 'invalid terminal operation status: %', p_status;
    END IF;

    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN FALSE;
    END IF;

    UPDATE public.operations
    SET status = p_status,
        error_code = p_error_code,
        error_message = p_error_message,
        completed_at = p_now,
        cancelled_at = CASE WHEN p_status = 'cancelled' THEN p_now ELSE NULL END,
        updated_at = p_now
    WHERE id = p_operation_id;

    v_event_type := CASE p_status
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'interrupted' THEN 'interrupted'
        ELSE 'error'
    END;

    INSERT INTO public.operation_events (
        id, operation_id, meeting_id, type, payload, created_at
    ) VALUES (
        gen_random_uuid(), p_operation_id, v_op.meeting_id, v_event_type,
        jsonb_build_object(
            'code', p_error_code,
            'message', p_error_message
        ), p_now
    );

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_turn_operation(
    p_operation_id UUID,
    p_meeting_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
BEGIN
    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id AND meeting_id = p_meeting_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_op.status = 'pending' THEN
        UPDATE public.operations
        SET status = 'cancelled',
            error_code = 'cancelled_by_user',
            error_message = 'Cancelled before execution.',
            completed_at = p_now,
            cancelled_at = p_now,
            updated_at = p_now
        WHERE id = p_operation_id;

        INSERT INTO public.operation_events (
            id, operation_id, meeting_id, type, payload, created_at
        ) VALUES (
            gen_random_uuid(), p_operation_id, v_op.meeting_id, 'cancelled',
            jsonb_build_object(
                'code', 'cancelled_by_user',
                'message', 'Cancelled before execution.'
            ), p_now
        );

        RETURN jsonb_build_object('outcome', 'cancelled', 'status', 'cancelled');
    END IF;

    IF v_op.status = 'processing' THEN
        IF v_op.cancel_requested_at IS NULL THEN
            UPDATE public.operations
            SET cancel_requested_at = p_now,
                updated_at = p_now
            WHERE id = p_operation_id;

            INSERT INTO public.operation_events (
                id, operation_id, meeting_id, type, payload, created_at
            ) VALUES (
                gen_random_uuid(), p_operation_id, v_op.meeting_id, 'status',
                jsonb_build_object('status', 'cancel_requested'), p_now
            );
        END IF;

        RETURN jsonb_build_object(
            'outcome', 'cancel_requested',
            'status', 'executing'
        );
    END IF;

    RETURN jsonb_build_object(
        'outcome', 'terminal',
        'status', CASE v_op.status
            WHEN 'done' THEN 'completed'
            ELSE v_op.status
        END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_turn_operations_for_meeting(
    p_meeting_id UUID,
    p_reason TEXT,
    p_now TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_row public.operations;
    v_count INTEGER := 0;
BEGIN
    FOR v_row IN
        SELECT * FROM public.operations
        WHERE meeting_id = p_meeting_id
          AND status IN ('pending', 'processing')
        FOR UPDATE SKIP LOCKED
    LOOP
        IF v_row.status = 'pending' THEN
            UPDATE public.operations
            SET status = 'cancelled',
                error_code = p_reason,
                error_message = 'Cancelled because the meeting is no longer active.',
                completed_at = p_now,
                cancelled_at = p_now,
                updated_at = p_now
            WHERE id = v_row.id;

            INSERT INTO public.operation_events (
                id, operation_id, meeting_id, type, payload, created_at
            ) VALUES (
                gen_random_uuid(), v_row.id, v_row.meeting_id, 'cancelled',
                jsonb_build_object(
                    'code', p_reason,
                    'message', 'Cancelled because the meeting is no longer active.'
                ), p_now
            );
        ELSE
            UPDATE public.operations
            SET cancel_requested_at = COALESCE(cancel_requested_at, p_now),
                updated_at = p_now
            WHERE id = v_row.id;

            IF v_row.cancel_requested_at IS NULL THEN
                INSERT INTO public.operation_events (
                    id, operation_id, meeting_id, type, payload, created_at
                ) VALUES (
                    gen_random_uuid(), v_row.id, v_row.meeting_id, 'status',
                    jsonb_build_object(
                        'status', 'cancel_requested',
                        'reason', p_reason
                    ), p_now
                );
            END IF;
        END IF;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

-- --------------------------------------------------------------------------
-- Durable events and observation reads.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.append_turn_event(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_event_id UUID,
    p_type TEXT,
    p_payload JSONB,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_event public.operation_events;
BEGIN
    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.operation_events (
        id, operation_id, meeting_id, type, payload, created_at
    ) VALUES (
        p_event_id, p_operation_id, v_op.meeting_id, p_type,
        COALESCE(p_payload, '{}'::jsonb), p_now
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO v_event;

    IF NOT FOUND THEN
        SELECT * INTO v_event
        FROM public.operation_events
        WHERE id = p_event_id;
    END IF;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN to_jsonb(v_event);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_turn_events(
    p_operation_id UUID,
    p_meeting_id UUID,
    p_after_sequence BIGINT,
    p_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_events JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.sequence), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT *
        FROM public.operation_events
        WHERE operation_id = p_operation_id
          AND meeting_id = p_meeting_id
          AND sequence > COALESCE(p_after_sequence, 0)
        ORDER BY sequence
        LIMIT COALESCE(p_limit, 500)
    ) e;

    RETURN v_events;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_turn_operation_status(
    p_operation_id UUID,
    p_meeting_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_meeting_status TEXT;
    v_position INTEGER;
BEGIN
    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id AND meeting_id = p_meeting_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT status INTO v_meeting_status
    FROM public.meetings
    WHERE id = p_meeting_id;

    v_position := CASE WHEN v_op.status = 'pending' THEN (
        SELECT COUNT(*) FROM public.operations q
        WHERE q.meeting_id = p_meeting_id
          AND q.status = 'pending'
          AND q.admission <= v_op.admission
    ) ELSE NULL END;

    RETURN to_jsonb(v_op) || jsonb_build_object(
        'queue_position', v_position,
        'meeting_status', v_meeting_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_turn_operations(
    p_meeting_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_operations JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(
        to_jsonb(o) || jsonb_build_object(
            'queue_position',
            CASE WHEN o.status = 'pending' THEN (
                SELECT COUNT(*) FROM public.operations q
                WHERE q.meeting_id = o.meeting_id
                  AND q.status = 'pending'
                  AND q.admission <= o.admission
            ) ELSE NULL END
        )
        ORDER BY o.admission
    ), '[]'::jsonb)
    INTO v_operations
    FROM (
        SELECT *
        FROM public.operations
        WHERE meeting_id = p_meeting_id
        ORDER BY admission
        LIMIT COALESCE(p_limit, 100)
    ) o;

    RETURN v_operations;
END;
$$;

-- --------------------------------------------------------------------------
-- Communication effects: fenced and deduplicated by call identity.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_turn_disagreement(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_invocation_id TEXT,
    p_call_id TEXT,
    p_source_ai_id UUID,
    p_target_name TEXT,
    p_topic TEXT,
    p_reasoning TEXT,
    p_severity INTEGER,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_row public.disagreements;
BEGIN
    IF p_invocation_id IS NULL OR p_call_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.disagreements (
        meeting_id, source_ai_id, target_name, topic, reasoning,
        severity, operation_id, invocation_id, call_id, created_at
    ) VALUES (
        v_op.meeting_id,
        COALESCE(p_source_ai_id, v_op.participant_id),
        p_target_name, p_topic, p_reasoning,
        COALESCE(p_severity, 3), p_operation_id,
        p_invocation_id, p_call_id, p_now
    )
    ON CONFLICT (operation_id, invocation_id, call_id)
        WHERE operation_id IS NOT NULL
        DO NOTHING
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        SELECT * INTO v_row
        FROM public.disagreements
        WHERE operation_id = p_operation_id
          AND invocation_id = p_invocation_id
          AND call_id = p_call_id;
    END IF;

    RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_turn_consensus(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_invocation_id TEXT,
    p_call_id TEXT,
    p_participants JSONB,
    p_topic TEXT,
    p_strength INTEGER,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_row public.consensus;
BEGIN
    IF p_invocation_id IS NULL OR p_call_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.consensus (
        meeting_id, participants, topic, strength,
        operation_id, invocation_id, call_id, created_at
    ) VALUES (
        v_op.meeting_id, COALESCE(p_participants, '[]'::jsonb),
        p_topic, COALESCE(p_strength, 3), p_operation_id,
        p_invocation_id, p_call_id, p_now
    )
    ON CONFLICT (operation_id, invocation_id, call_id)
        WHERE operation_id IS NOT NULL
        DO NOTHING
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        SELECT * INTO v_row
        FROM public.consensus
        WHERE operation_id = p_operation_id
          AND invocation_id = p_invocation_id
          AND call_id = p_call_id;
    END IF;

    RETURN to_jsonb(v_row);
END;
$$;

-- --------------------------------------------------------------------------
-- Permissions: browser roles cannot call queue internals.
-- --------------------------------------------------------------------------

DO $$
DECLARE
    seq record;
    target TEXT[] := ARRAY[
        'admit_turn_operation',
        'claim_next_turn_operation',
        'renew_turn_operation_lease',
        'start_turn_operation',
        'recover_turn_operations',
        'begin_turn_attempt',
        'complete_turn_attempt',
        'fail_turn_attempt',
        'publish_turn_operation',
        'fail_turn_operation',
        'cancel_turn_operation',
        'cancel_turn_operations_for_meeting',
        'append_turn_event',
        'read_turn_events',
        'get_turn_operation_status',
        'list_turn_operations',
        'record_turn_disagreement',
        'record_turn_consensus'
    ];
BEGIN
    FOR seq IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY(target)
    LOOP
        EXECUTE format(
            'revoke all on function public.%I(%s) from public',
            seq.proname, seq.args
        );
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format(
                'revoke all on function public.%I(%s) from anon',
                seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format(
                'revoke all on function public.%I(%s) from authenticated',
                seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format(
                'grant execute on function public.%I(%s) to service_role',
                seq.proname, seq.args
            );
        END IF;
    END LOOP;
END $$;
