-- Coordinated closing lifecycle RPCs (spec 08).
--
-- Lock order: every function that touches both rows locks the meeting
-- row first, then the closing row. Request and completion therefore
-- serialize with turn admission (which holds the meeting row) and with
-- each other, while stage checkpoints that need only the closing row do
-- not invert the order.
--
-- Two barriers are deliberately distinct:
-- * pending turns are cancelled immediately by request;
-- * the one executing turn is never cancellation-requested here. It
--   drains to its own committed terminal outcome, and mark_closing_stage
--   refuses to leave draining while a processing turn still exists.
--
-- No function holds a transaction across a provider call; the caller
-- reserves an attempt, releases the connection, then checkpoints.

-- --------------------------------------------------------------------------
-- 1) Request the close: close admission, cancel waiting turns, record one
--    durable operation.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_meeting_closing(
    p_meeting_id UUID,
    p_request_key TEXT,
    p_mode TEXT,
    p_summary_settings JSONB,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings;
    v_closing public.meeting_closings;
    v_operation public.operations;
    v_has_running BOOLEAN;
    v_stage TEXT;
    v_previous_status TEXT;
BEGIN
    IF p_request_key IS NULL OR length(p_request_key) = 0 THEN
        RETURN jsonb_build_object('outcome', 'invalid');
    END IF;
    IF p_mode NOT IN ('vote', 'force') THEN
        RETURN jsonb_build_object('outcome', 'invalid');
    END IF;

    SELECT * INTO v_meeting
    FROM public.meetings
    WHERE id = p_meeting_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_meeting.archived_at IS NOT NULL
       OR v_meeting.status IN ('ended', 'archived') THEN
        RETURN jsonb_build_object('outcome', 'meeting_closed');
    END IF;

    -- A committed ending is never re-closed, even if a lifecycle row was
    -- repaired inconsistently by an older deployment.
    IF EXISTS (
        SELECT 1 FROM public.meeting_closings
        WHERE meeting_id = p_meeting_id AND stage = 'completed'
    ) THEN
        RETURN jsonb_build_object('outcome', 'already_completed');
    END IF;

    -- Same request key is idempotent.
    SELECT * INTO v_closing
    FROM public.meeting_closings
    WHERE meeting_id = p_meeting_id AND request_key = p_request_key;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'outcome', 'resumed',
            'closing', to_jsonb(v_closing)
        );
    END IF;

    -- Any open operation (including failed/recoverable) is resumed rather
    -- than duplicated; recovery is an explicit retry command.
    SELECT * INTO v_closing
    FROM public.meeting_closings
    WHERE meeting_id = p_meeting_id
      AND stage IN ('draining', 'voting', 'summarizing', 'failed')
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'outcome', 'resumed',
            'closing', to_jsonb(v_closing)
        );
    END IF;

    IF v_meeting.status NOT IN ('active', 'voting') THEN
        RETURN jsonb_build_object('outcome', 'meeting_closed');
    END IF;

    -- Waiting work is cancelled, not left to claim against a closing
    -- meeting. The executing turn keeps its claim and drains.
    FOR v_operation IN
        SELECT * FROM public.operations
        WHERE meeting_id = p_meeting_id AND status = 'pending'
        FOR UPDATE
    LOOP
        UPDATE public.operations
        SET status = 'cancelled',
            error_code = 'meeting_ending',
            error_message = 'Cancelled because the meeting is ending.',
            completed_at = p_now,
            cancelled_at = p_now,
            updated_at = p_now
        WHERE id = v_operation.id;

        INSERT INTO public.operation_events (
            id, operation_id, meeting_id, type, payload, created_at
        ) VALUES (
            gen_random_uuid(), v_operation.id, v_operation.meeting_id,
            'cancelled',
            jsonb_build_object(
                'code', 'meeting_ending',
                'message', 'Cancelled because the meeting is ending.'
            ),
            p_now
        );
    END LOOP;

    SELECT EXISTS (
        SELECT 1 FROM public.operations
        WHERE meeting_id = p_meeting_id AND status = 'processing'
    ) INTO v_has_running;

    IF v_has_running THEN
        v_stage := 'draining';
    ELSIF p_mode = 'force' OR v_meeting.status = 'voting' THEN
        v_stage := 'summarizing';
    ELSE
        v_stage := 'voting';
    END IF;

    v_previous_status := v_meeting.status;

    IF v_meeting.status = 'active' THEN
        UPDATE public.meetings SET status = 'voting' WHERE id = p_meeting_id;
        v_meeting.status := 'voting';
    END IF;

    INSERT INTO public.meeting_closings (
        meeting_id, request_key, mode, stage, from_status,
        summary_settings, created_at, updated_at
    ) VALUES (
        p_meeting_id, p_request_key, p_mode, v_stage, v_previous_status,
        COALESCE(p_summary_settings, '{}'::jsonb), p_now, p_now
    )
    RETURNING * INTO v_closing;

    RETURN jsonb_build_object(
        'outcome', 'created',
        'closing', to_jsonb(v_closing)
    );
END;
$$;

-- A claim must take the meeting row lock before it locks the operation row.
-- Closing request takes that same order, so a request that cancels waiting
-- work cannot deadlock against a claim that is inserting its operation event
-- (whose foreign key needs a key-share lock on the meeting). Without this
-- ordering, Postgres reports a genuine deadlock between admission and drain.
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

        -- Closing may have won the meeting lock while this claim waited.
        -- Waiting work is its responsibility to cancel; this worker simply
        -- stops instead of executing against a closing meeting.
        IF NOT EXISTS (
            SELECT 1 FROM public.meetings
            WHERE id = v_meeting_id AND status = 'active'
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

        -- Another worker claimed or the operation was cancelled between the
        -- candidate read and the lock. Pick the next candidate.
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

-- --------------------------------------------------------------------------
-- 2) Read the canonical closing record and its ballots.
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
    v_meeting public.meetings;
    v_closing public.meeting_closings;
    v_votes JSONB;
BEGIN
    SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'meeting', NULL,
            'closing', NULL,
            'votes', '[]'::jsonb
        );
    END IF;

    SELECT * INTO v_closing
    FROM public.meeting_closings
    WHERE meeting_id = p_meeting_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'meeting', to_jsonb(v_meeting),
            'closing', NULL,
            'votes', '[]'::jsonb
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
        'meeting', to_jsonb(v_meeting),
        'closing', to_jsonb(v_closing),
        'votes', v_votes
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 3) Stage transitions and recovery.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_closing_stage(
    p_closing_id UUID,
    p_expected_stage TEXT,
    p_next_stage TEXT,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting_id UUID;
BEGIN
    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings
    WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF p_next_stage NOT IN ('voting', 'summarizing') THEN
        RETURN FALSE;
    END IF;

    -- Draining ends only when the sole executing turn has committed its
    -- own terminal outcome. Pending turns were already cancelled.
    IF p_expected_stage = 'draining' AND EXISTS (
        SELECT 1 FROM public.operations
        WHERE meeting_id = v_meeting_id AND status = 'processing'
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE public.meeting_closings
    SET stage = p_next_stage,
        error_code = NULL,
        error_message = NULL,
        updated_at = p_now
    WHERE id = p_closing_id
      AND stage = p_expected_stage;

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_meeting_closing(
    p_closing_id UUID,
    p_expected_stage TEXT,
    p_error_code TEXT,
    p_error_message TEXT,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.meeting_closings
    SET stage = 'failed',
        failed_from_stage = p_expected_stage,
        error_code = p_error_code,
        error_message = p_error_message,
        updated_at = p_now
    WHERE id = p_closing_id
      AND stage = p_expected_stage
      AND p_expected_stage IN ('draining', 'voting', 'summarizing');

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_meeting_closing(
    p_closing_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting_id UUID;
    v_meeting public.meetings;
    v_closing public.meeting_closings;
BEGIN
    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    SELECT * INTO v_closing FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    IF v_closing.stage <> 'failed'
       OR v_closing.failed_from_stage IS NULL
       OR v_meeting.archived_at IS NOT NULL
       OR v_meeting.status NOT IN ('active', 'voting') THEN
        RETURN FALSE;
    END IF;

    -- A confirmed summary checkpoint is always reused. An attempt with no
    -- checkpoint is uncertain: the explicit retry discards its identity so
    -- the next advance may make one new paid call; it is never automatic.
    UPDATE public.meeting_closings
    SET stage = failed_from_stage,
        failed_from_stage = NULL,
        error_code = NULL,
        error_message = NULL,
        summary_attempt_id = CASE
            WHEN failed_from_stage = 'summarizing' AND summary_text IS NULL
            THEN NULL ELSE summary_attempt_id END,
        summary_attempt_number = CASE
            WHEN failed_from_stage = 'summarizing' AND summary_text IS NULL
            THEN NULL ELSE summary_attempt_number END,
        summary_attempt_lease_expires_at = CASE
            WHEN failed_from_stage = 'summarizing' AND summary_text IS NULL
            THEN NULL ELSE summary_attempt_lease_expires_at END,
        updated_at = p_now
    WHERE id = p_closing_id;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_meeting_closing(
    p_closing_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting_id UUID;
    v_meeting public.meetings;
    v_closing public.meeting_closings;
BEGIN
    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    SELECT * INTO v_closing FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    IF v_closing.stage <> 'voting'
       OR v_meeting.status <> 'voting'
       OR v_meeting.archived_at IS NOT NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.meeting_closings
    SET stage = 'rejected',
        completed_at = p_now,
        updated_at = p_now,
        error_code = NULL,
        error_message = NULL
    WHERE id = p_closing_id;

    -- Reopen admission. Cancelled turns stay cancelled.
    UPDATE public.meetings SET status = 'active' WHERE id = v_meeting_id;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.abort_meeting_closing(
    p_closing_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting_id UUID;
    v_meeting public.meetings;
    v_closing public.meeting_closings;
BEGIN
    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    SELECT * INTO v_closing FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    IF v_closing.stage NOT IN ('draining', 'voting', 'failed')
       OR v_meeting.status <> 'voting'
       OR v_meeting.archived_at IS NOT NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.meeting_closings
    SET stage = 'aborted',
        failed_from_stage = NULL,
        completed_at = p_now,
        updated_at = p_now,
        error_code = NULL,
        error_message = NULL
    WHERE id = p_closing_id;

    UPDATE public.meetings SET status = 'active' WHERE id = v_meeting_id;

    RETURN TRUE;
END;
$$;

-- --------------------------------------------------------------------------
-- 4) The once-only final summary + ended commit.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_meeting_closing(
    p_closing_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting_id UUID;
    v_meeting public.meetings;
    v_closing public.meeting_closings;
    v_message_id UUID;
BEGIN
    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    SELECT * INTO v_closing FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    -- Repeating a successful commit returns the same committed ending.
    IF v_closing.stage = 'completed' THEN
        RETURN jsonb_build_object(
            'outcome', 'completed',
            'message_id', v_closing.summary_message_id
        );
    END IF;

    IF v_closing.stage <> 'summarizing' THEN
        RETURN jsonb_build_object('outcome', 'conflict');
    END IF;

    IF v_closing.summary_text IS NULL THEN
        RETURN jsonb_build_object('outcome', 'summary_missing');
    END IF;

    IF v_meeting.status <> 'voting' OR v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'meeting_closed');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.meeting_closings
        WHERE meeting_id = v_meeting_id
          AND stage = 'completed'
          AND id <> p_closing_id
    ) THEN
        RETURN jsonb_build_object('outcome', 'already_completed');
    END IF;

    INSERT INTO public.messages (
        meeting_id, sender_type, sender_name, content
    ) VALUES (
        v_meeting_id, 'system', 'System', v_closing.summary_text
    )
    RETURNING id INTO v_message_id;

    UPDATE public.meeting_closings
    SET stage = 'completed',
        summary_message_id = v_message_id,
        completed_at = p_now,
        updated_at = p_now,
        error_code = NULL,
        error_message = NULL
    WHERE id = p_closing_id;

    UPDATE public.meetings SET status = 'ended' WHERE id = v_meeting_id;

    RETURN jsonb_build_object(
        'outcome', 'completed',
        'message_id', v_message_id
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 5) Guarded archive, unarchive, and user-message writes.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_meeting_guarded(
    p_meeting_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings;
BEGIN
    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = p_meeting_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'archived', 'status', 'archived');
    END IF;

    IF v_meeting.status = 'voting' OR EXISTS (
        SELECT 1 FROM public.meeting_closings
        WHERE meeting_id = p_meeting_id AND stage = 'failed'
    ) THEN
        RETURN jsonb_build_object('outcome', 'closing_in_progress');
    END IF;

    UPDATE public.meetings
    SET archived_at = p_now
    WHERE id = p_meeting_id;

    RETURN jsonb_build_object('outcome', 'archived', 'status', 'archived');
END;
$$;

CREATE OR REPLACE FUNCTION public.unarchive_meeting_guarded(
    p_meeting_id UUID,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings;
BEGIN
    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = p_meeting_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    -- Legacy rows may still carry the old status value. Resolve it once,
    -- never from archive timing and never by reopening an ended meeting.
    IF v_meeting.status = 'archived' THEN
        UPDATE public.meetings
        SET status = CASE
                WHEN EXISTS (
                    SELECT 1 FROM public.messages
                    WHERE meeting_id = p_meeting_id
                      AND sender_type = 'system'
                      AND content LIKE '📋 **MEETING ENDED**%'
                ) THEN 'ended'
                ELSE 'active'
            END,
            archived_at = NULL
        WHERE id = p_meeting_id
        RETURNING * INTO v_meeting;
    ELSE
        UPDATE public.meetings
        SET archived_at = NULL
        WHERE id = p_meeting_id
        RETURNING * INTO v_meeting;
    END IF;

    RETURN jsonb_build_object(
        'outcome', 'unarchived',
        'status', v_meeting.status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_user_message(
    p_meeting_id UUID,
    p_message JSONB,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings;
    v_row public.messages;
    v_request_key TEXT;
BEGIN
    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = p_meeting_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_meeting.status <> 'active' OR v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'meeting_closed');
    END IF;

    IF p_message->>'content' IS NULL THEN
        RETURN jsonb_build_object('outcome', 'invalid');
    END IF;

    v_request_key := NULLIF(p_message->>'request_key', '');

    INSERT INTO public.messages (
        id, meeting_id, sender_type, sender_id, sender_name, content,
        citations, tool_artifacts, thinking_content, estimated_cost,
        created_at, request_key, effective_generation
    ) VALUES (
        COALESCE(NULLIF(p_message->>'id', '')::uuid, gen_random_uuid()),
        p_meeting_id,
        COALESCE(NULLIF(p_message->>'sender_type', ''), 'user'),
        NULLIF(p_message->>'sender_id', '')::uuid,
        COALESCE(NULLIF(p_message->>'sender_name', ''), 'User'),
        p_message->>'content',
        COALESCE(p_message->'citations', '[]'::jsonb),
        p_message->'tool_artifacts',
        p_message->>'thinking_content',
        COALESCE((p_message->>'estimated_cost')::numeric, 0.0),
        COALESCE((p_message->>'created_at')::timestamptz, p_now),
        v_request_key,
        p_message->'effective_generation'
    )
    ON CONFLICT (meeting_id, request_key)
        WHERE request_key IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        -- A retried write with the same request key returns the original.
        IF v_request_key IS NOT NULL THEN
            SELECT * INTO v_row FROM public.messages
            WHERE meeting_id = p_meeting_id AND request_key = v_request_key;
            IF FOUND THEN
                RETURN jsonb_build_object(
                    'outcome', 'duplicate',
                    'message', to_jsonb(v_row)
                );
            END IF;
        END IF;
        RETURN jsonb_build_object('outcome', 'invalid');
    END IF;

    RETURN jsonb_build_object(
        'outcome', 'accepted',
        'message', to_jsonb(v_row)
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 6) Execution rights: backend service role only.
-- --------------------------------------------------------------------------

DO $$
DECLARE
    target TEXT[] := ARRAY[
        'request_meeting_closing',
        'read_meeting_closing',
        'mark_closing_stage',
        'fail_meeting_closing',
        'retry_meeting_closing',
        'reject_meeting_closing',
        'abort_meeting_closing',
        'complete_meeting_closing',
        'archive_meeting_guarded',
        'unarchive_meeting_guarded',
        'append_user_message'
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
