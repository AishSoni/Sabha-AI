-- Batched turn-event persistence (spec 20).
--
-- Providers stream one event per delta. Persisting every delta as its own
-- round trip made generation wait on the database: the next token was not
-- read until the previous insert returned. The observation log is still one
-- row per delta (sequence and replay cursor semantics do not change); this
-- function inserts a whole ordered batch in one statement.
--
-- The operation row is locked and the fence checked once per batch. A stale,
-- terminal or unknown operation returns an empty array, matching the single
-- event function's NULL. Duplicate event ids keep their first row, so a
-- retried batch is idempotent.

CREATE OR REPLACE FUNCTION public.append_turn_events(
    p_operation_id UUID,
    p_expected_fence INTEGER,
    p_events JSONB,
    p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_op public.operations;
    v_rows JSONB;
BEGIN
    SELECT * INTO v_op
    FROM public.operations
    WHERE id = p_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_op.status <> 'processing'
       OR v_op.fence_version <> p_expected_fence THEN
        RETURN '[]'::jsonb;
    END IF;

    -- jsonb_array_elements preserves array position; the identity sequence
    -- is assigned in that order, so sequence keeps matching the stream.
    INSERT INTO public.operation_events (
        id, operation_id, meeting_id, type, payload, created_at
    )
    SELECT
        (item.element ->> 'id')::UUID,
        p_operation_id,
        v_op.meeting_id,
        item.element ->> 'type',
        COALESCE(item.element -> 'payload', '{}'::jsonb),
        p_now
    FROM jsonb_array_elements(COALESCE(p_events, '[]'::jsonb))
        WITH ORDINALITY AS item(element, position)
    ORDER BY item.position
    ON CONFLICT (id) DO NOTHING;

    -- Return the durable rows for every id in the batch: newly inserted rows
    -- and rows a retry already stored. Ordering is the replay order.
    SELECT COALESCE(jsonb_agg(to_jsonb(event) ORDER BY event.sequence), '[]'::jsonb)
    INTO v_rows
    FROM public.operation_events AS event
    JOIN (
        SELECT DISTINCT (element ->> 'id')::UUID AS event_id
        FROM jsonb_array_elements(COALESCE(p_events, '[]'::jsonb)) AS element
    ) AS sent ON sent.event_id = event.id;

    RETURN v_rows;
END;
$$;

-- --------------------------------------------------------------------------
-- Execution rights: backend service role only (013 posture).
-- --------------------------------------------------------------------------
DO $$
DECLARE
    target TEXT[] := ARRAY['append_turn_events'];
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
        EXECUTE format(
            'grant execute on function public.%I(%s) to service_role',
            fn.proname, fn.args
        );
    END LOOP;
END;
$$;
