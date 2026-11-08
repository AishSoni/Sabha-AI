-- Spec 35 / T22: keep every active turn visible.
--
-- The original read took the oldest `p_limit` admissions. Once a meeting had
-- more than `p_limit` terminal operations, later active work fell outside the
-- window and disappeared from the room. Active work is now returned without a
-- limit; `p_limit` bounds only the recent-terminal history that gives the
-- queue surface its context.

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
    WITH active AS (
        SELECT *
        FROM public.operations
        WHERE meeting_id = p_meeting_id
          AND status IN ('pending', 'processing')
    ),
    recent_terminal AS (
        SELECT *
        FROM public.operations
        WHERE meeting_id = p_meeting_id
          AND status IN ('done', 'failed', 'interrupted', 'cancelled')
        ORDER BY admission DESC
        LIMIT COALESCE(p_limit, 100)
    ),
    windowed AS (
        SELECT * FROM active
        UNION ALL
        SELECT * FROM recent_terminal
    )
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
    FROM windowed o;

    RETURN v_operations;
END;
$$;
