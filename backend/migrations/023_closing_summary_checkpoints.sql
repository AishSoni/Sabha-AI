-- Closing summary checkpoints (spec 08).
--
-- The summary is the only paid step whose text becomes the committed ending.
-- Its attempt id is reserved before the provider call and is also the ledger
-- primary key. A confirmed checkpoint is reused forever; an expired attempt
-- is uncertain and requires an explicit closing retry, never a blind replay.
--
-- Lock order remains meeting -> closing.

CREATE OR REPLACE FUNCTION public.reserve_closing_summary_attempt(
    p_closing_id UUID,
    p_attempt_id UUID,
    p_lease_seconds INTEGER,
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

    IF v_closing.stage <> 'summarizing'
       OR v_meeting.status <> 'voting'
       OR v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('outcome', 'conflict');
    END IF;

    -- Once a summary is checkpointed, no provider call is ever needed again.
    IF v_closing.summary_text IS NOT NULL THEN
        RETURN jsonb_build_object(
            'outcome', 'checkpointed',
            'summary_text', v_closing.summary_text,
            'attempt_id', v_closing.summary_attempt_id,
            'attempt_number', v_closing.summary_attempt_number
        );
    END IF;

    IF v_closing.summary_attempt_id IS NOT NULL
       AND v_closing.summary_attempt_lease_expires_at IS NOT NULL
       AND v_closing.summary_attempt_lease_expires_at > p_now THEN
        RETURN jsonb_build_object(
            'outcome', 'in_flight',
            'attempt_id', v_closing.summary_attempt_id,
            'attempt_number', v_closing.summary_attempt_number,
            'lease_expires_at', v_closing.summary_attempt_lease_expires_at
        );
    END IF;

    IF v_closing.summary_attempt_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'outcome', 'uncertain',
            'attempt_id', v_closing.summary_attempt_id,
            'attempt_number', v_closing.summary_attempt_number,
            'lease_expires_at', v_closing.summary_attempt_lease_expires_at
        );
    END IF;

    UPDATE public.meeting_closings
    SET summary_attempt_id = p_attempt_id,
        summary_attempt_number = COALESCE(summary_attempt_number, 0) + 1,
        summary_attempt_lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        updated_at = p_now
    WHERE id = p_closing_id;

    RETURN jsonb_build_object(
        'outcome', 'started',
        'attempt_id', p_attempt_id,
        'attempt_number', COALESCE(v_closing.summary_attempt_number, 0) + 1,
        'lease_expires_at', p_now + make_interval(secs => p_lease_seconds)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_closing_summary_checkpoint(
    p_closing_id UUID,
    p_attempt_id UUID,
    p_summary_text TEXT,
    p_provider TEXT,
    p_model TEXT,
    p_purpose TEXT,
    p_usage JSONB,
    p_usage_kind TEXT,
    p_price_kind TEXT,
    p_estimated_cost DECIMAL,
    p_reported_cost DECIMAL,
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
    v_ledger BOOLEAN := FALSE;
BEGIN
    IF p_purpose NOT IN ('summary', 'forced_summary') OR p_attempt_id IS NULL THEN
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

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    -- The call was paid even if the attempt became stale. Record its usage
    -- first; only a matching, uncheckpointed attempt may own the text.
    IF p_usage IS NOT NULL OR p_usage_kind IS NOT NULL THEN
        INSERT INTO public.inference_events (
            id, meeting_id, purpose, provider, model, estimated_cost,
            usage, usage_kind, price_kind, reported_cost, closing_id, created_at
        ) VALUES (
            p_attempt_id, v_meeting_id, p_purpose, p_provider, p_model,
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

    IF p_summary_text IS NULL OR length(p_summary_text) = 0 THEN
        RETURN jsonb_build_object(
            'outcome', 'invalid',
            'ledger_recorded', v_ledger
        );
    END IF;

    IF v_closing.summary_text IS NOT NULL THEN
        RETURN jsonb_build_object(
            'outcome', 'already_saved',
            'summary_text', v_closing.summary_text,
            'ledger_recorded', v_ledger
        );
    END IF;

    IF v_closing.stage <> 'summarizing'
       OR v_closing.summary_attempt_id IS DISTINCT FROM p_attempt_id
       OR v_meeting.status <> 'voting'
       OR v_meeting.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'outcome', 'stale',
            'ledger_recorded', v_ledger
        );
    END IF;

    UPDATE public.meeting_closings
    SET summary_text = p_summary_text,
        summary_attempt_lease_expires_at = NULL,
        updated_at = p_now
    WHERE id = p_closing_id;

    RETURN jsonb_build_object(
        'outcome', 'saved',
        'summary_text', p_summary_text,
        'ledger_recorded', v_ledger
    );
END;
$$;

DO $$
DECLARE
    target TEXT[] := ARRAY[
        'reserve_closing_summary_attempt',
        'save_closing_summary_checkpoint'
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
