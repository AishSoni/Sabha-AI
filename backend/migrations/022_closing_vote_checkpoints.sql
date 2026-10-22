-- Closing vote checkpoints and attempt accounting (spec 08).
--
-- A ballot is a paid provider attempt. Its stable attempt id is reserved
-- before the provider call, so a response can be checkpointed with its usage
-- even if the closing later fails or the caller loses the response. The
-- ledger primary key is the attempt id, making every retry idempotent.
--
-- Lock order remains meeting -> closing -> vote. Total cost is only moved
-- through the ledger, and only when the ledger row is first inserted.

ALTER TABLE public.inference_events
    ADD COLUMN IF NOT EXISTS closing_id UUID
    REFERENCES public.meeting_closings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inference_events_closing_id
    ON public.inference_events (closing_id);

-- --------------------------------------------------------------------------
-- Freeze the voting roster when voting starts.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_closing_voting(
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
    v_count INTEGER;
BEGIN
    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings
    WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    SELECT * INTO v_closing FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    IF v_closing.stage <> 'voting' THEN
        RETURN jsonb_build_object('outcome', 'conflict');
    END IF;

    IF v_meeting.status <> 'voting' OR v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'meeting_closed');
    END IF;

    INSERT INTO public.closing_votes (closing_id, participant_id, status)
    SELECT p_closing_id, p.id, 'pending'
    FROM public.ai_participants p
    WHERE p.meeting_id = v_meeting_id
      AND NOT EXISTS (
          SELECT 1 FROM public.closing_votes v
          WHERE v.closing_id = p_closing_id
      )
    ON CONFLICT (closing_id, participant_id) DO NOTHING;

    SELECT COUNT(*) INTO v_count
    FROM public.closing_votes
    WHERE closing_id = p_closing_id;

    RETURN jsonb_build_object(
        'outcome', 'started',
        'participant_count', v_count
    );
END;
$$;

-- --------------------------------------------------------------------------
-- Reserve one participant's ballot attempt before calling the provider.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.begin_closing_vote_attempt(
    p_closing_id UUID,
    p_participant_id UUID,
    p_attempt_id UUID,
    p_lease_seconds INTEGER,
    p_provider TEXT,
    p_model TEXT,
    p_settings JSONB,
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
    v_vote public.closing_votes;
BEGIN
    IF p_attempt_id IS NULL THEN
        RETURN jsonb_build_object('outcome', 'invalid');
    END IF;

    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings
    WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    SELECT * INTO v_closing FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    IF v_closing.stage <> 'voting'
       OR v_meeting.status <> 'voting'
       OR v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'conflict');
    END IF;

    SELECT * INTO v_vote FROM public.closing_votes
    WHERE closing_id = p_closing_id
      AND participant_id = p_participant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    -- A confirmed ballot is never paid for twice.
    IF v_vote.status = 'completed' THEN
        RETURN jsonb_build_object(
            'outcome', 'completed',
            'attempt_id', v_vote.attempt_id,
            'vote', jsonb_build_object(
                'participant_id', v_vote.participant_id,
                'status', v_vote.status,
                'vote', v_vote.vote,
                'reason', v_vote.reason,
                'attempt_number', v_vote.attempt_number,
                'usage', v_vote.usage,
                'usage_kind', v_vote.usage_kind,
                'price_kind', v_vote.price_kind,
                'estimated_cost', v_vote.estimated_cost,
                'reported_cost', v_vote.reported_cost
            )
        );
    END IF;

    -- A live lease means another caller is currently paying for this ballot.
    IF v_vote.status = 'pending'
       AND v_vote.attempt_lease_expires_at IS NOT NULL
       AND v_vote.attempt_lease_expires_at > p_now THEN
        RETURN jsonb_build_object(
            'outcome', 'in_flight',
            'attempt_id', v_vote.attempt_id,
            'attempt_number', v_vote.attempt_number,
            'lease_expires_at', v_vote.attempt_lease_expires_at
        );
    END IF;

    -- An expired or unknown attempt is uncertain, not safely replayable.
    -- Recovery must fail the closing and take an explicit retry first.
    IF v_vote.status = 'unknown'
       OR (v_vote.status = 'pending' AND v_vote.attempt_id IS NOT NULL) THEN
        RETURN jsonb_build_object(
            'outcome', 'uncertain',
            'attempt_id', v_vote.attempt_id,
            'attempt_number', v_vote.attempt_number,
            'lease_expires_at', v_vote.attempt_lease_expires_at
        );
    END IF;

    UPDATE public.closing_votes
    SET status = 'pending',
        attempt_id = p_attempt_id,
        attempt_number = v_vote.attempt_number + 1,
        attempt_lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        provider = p_provider,
        model = p_model,
        settings = COALESCE(p_settings, '{}'::jsonb),
        vote = NULL,
        reason = NULL,
        usage = NULL,
        usage_kind = NULL,
        price_kind = NULL,
        estimated_cost = 0.0,
        reported_cost = NULL,
        error_code = NULL,
        error_message = NULL,
        completed_at = NULL,
        updated_at = p_now
    WHERE closing_id = p_closing_id
      AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
        'outcome', 'started',
        'attempt_id', p_attempt_id,
        'attempt_number', v_vote.attempt_number + 1,
        'lease_expires_at', p_now + make_interval(secs => p_lease_seconds)
    );
END;
$$;

-- --------------------------------------------------------------------------
-- Resolve a ballot attempt and record its usage exactly once.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finish_closing_vote_attempt(
    p_closing_id UUID,
    p_participant_id UUID,
    p_attempt_id UUID,
    p_provider TEXT,
    p_model TEXT,
    p_status TEXT,
    p_vote BOOLEAN,
    p_reason TEXT,
    p_usage JSONB,
    p_usage_kind TEXT,
    p_price_kind TEXT,
    p_estimated_cost DECIMAL,
    p_reported_cost DECIMAL,
    p_error_code TEXT,
    p_error_message TEXT,
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
    v_vote public.closing_votes;
    v_updated BOOLEAN := FALSE;
    v_ledger BOOLEAN := FALSE;
BEGIN
    IF p_status NOT IN ('completed', 'failed', 'unknown') THEN
        RETURN jsonb_build_object('outcome', 'invalid');
    END IF;

    SELECT meeting_id INTO v_meeting_id
    FROM public.meeting_closings
    WHERE id = p_closing_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    SELECT * INTO v_meeting FROM public.meetings
    WHERE id = v_meeting_id FOR UPDATE;

    PERFORM 1 FROM public.meeting_closings
    WHERE id = p_closing_id FOR UPDATE;

    SELECT * INTO v_vote FROM public.closing_votes
    WHERE closing_id = p_closing_id
      AND participant_id = p_participant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    IF v_vote.attempt_id = p_attempt_id
       AND v_vote.status IN ('pending', 'unknown') THEN
        UPDATE public.closing_votes
        SET status = p_status,
            vote = p_vote,
            reason = p_reason,
            usage = p_usage,
            usage_kind = p_usage_kind,
            price_kind = p_price_kind,
            estimated_cost = COALESCE(p_estimated_cost, 0.0),
            reported_cost = p_reported_cost,
            error_code = p_error_code,
            error_message = p_error_message,
            attempt_lease_expires_at = NULL,
            completed_at = p_now,
            updated_at = p_now
        WHERE closing_id = p_closing_id
          AND participant_id = p_participant_id;

        v_updated := TRUE;
    END IF;

    -- A completed call is billed even when its ballot was rejected or its
    -- closing already failed. A provider exception without usage is not a
    -- completed call and must not fabricate a zero-cost ledger row.
    IF p_status = 'completed' OR p_usage IS NOT NULL THEN
        INSERT INTO public.inference_events (
            id, meeting_id, purpose, provider, model, estimated_cost,
            usage, usage_kind, price_kind, reported_cost, closing_id, created_at
        ) VALUES (
            p_attempt_id, v_meeting_id, 'vote', p_provider, p_model,
            COALESCE(p_estimated_cost, 0.0), p_usage, p_usage_kind, p_price_kind,
            p_reported_cost, p_closing_id, p_now
        )
        ON CONFLICT (id) DO NOTHING;

        IF FOUND THEN
            UPDATE public.meetings
            SET total_cost = total_cost + COALESCE(p_estimated_cost, 0.0)
            WHERE id = v_meeting_id;
            v_ledger := TRUE;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'outcome',
            CASE
                WHEN v_updated THEN 'recorded'
                WHEN v_ledger THEN 'stale_usage_recorded'
                ELSE 'duplicate'
            END,
        'vote_updated', v_updated,
        'ledger_recorded', v_ledger
    );
END;
$$;

-- --------------------------------------------------------------------------
-- Voting cannot finish while any ballot is still in flight or uncertain.
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

    IF p_expected_stage = 'draining' AND EXISTS (
        SELECT 1 FROM public.operations
        WHERE meeting_id = v_meeting_id AND status = 'processing'
    ) THEN
        RETURN FALSE;
    END IF;

    IF p_expected_stage = 'voting' AND EXISTS (
        SELECT 1 FROM public.closing_votes
        WHERE closing_id = p_closing_id
          AND status IN ('pending', 'unknown')
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

-- --------------------------------------------------------------------------
-- Explicit retry also releases uncertain ballots for a new attempt, while
-- confirmed ballots remain checkpointed.
-- --------------------------------------------------------------------------

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

    IF v_closing.failed_from_stage = 'voting' THEN
        UPDATE public.closing_votes
        SET status = 'failed',
            attempt_lease_expires_at = NULL,
            error_code = COALESCE(error_code, 'closing_retry'),
            error_message = COALESCE(error_message, 'Retried explicitly.'),
            updated_at = p_now
        WHERE closing_id = p_closing_id
          AND status IN ('pending', 'unknown');
    END IF;

    UPDATE public.meeting_closings
    SET stage = failed_from_stage,
        failed_from_stage = NULL,
        error_code = NULL,
        error_message = NULL,
        summary_attempt_id = CASE
            WHEN failed_from_stage = 'summarizing' AND summary_text IS NULL
            THEN NULL ELSE summary_attempt_id END,
        summary_attempt_lease_expires_at = CASE
            WHEN failed_from_stage = 'summarizing' AND summary_text IS NULL
            THEN NULL ELSE summary_attempt_lease_expires_at END,
        updated_at = p_now
    WHERE id = p_closing_id;

    RETURN TRUE;
END;
$$;

DO $$
DECLARE
    target TEXT[] := ARRAY[
        'start_closing_voting',
        'begin_closing_vote_attempt',
        'finish_closing_vote_attempt'
    ];
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY target LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated',
            fn
        );
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.%I TO service_role',
            fn
        );
    END LOOP;
END;
$$;
