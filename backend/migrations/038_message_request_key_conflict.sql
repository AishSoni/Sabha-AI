-- Spec 35 / T24: a request key identifies one message payload.
--
-- Retrying the same write must still return the original message. Reusing the
-- key for different content or sender identity is a conflict, not a silent
-- overwrite or a false duplicate acknowledgement.

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
    v_sender_type TEXT;
    v_sender_name TEXT;
    v_sender_id UUID;
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
    v_sender_type := COALESCE(NULLIF(p_message->>'sender_type', ''), 'user');
    v_sender_name := COALESCE(NULLIF(p_message->>'sender_name', ''), 'User');
    v_sender_id := NULLIF(p_message->>'sender_id', '')::uuid;

    INSERT INTO public.messages (
        id, meeting_id, sender_type, sender_id, sender_name, content,
        citations, tool_artifacts, thinking_content, estimated_cost,
        created_at, request_key, effective_generation
    ) VALUES (
        COALESCE(NULLIF(p_message->>'id', '')::uuid, gen_random_uuid()),
        p_meeting_id,
        v_sender_type,
        v_sender_id,
        v_sender_name,
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
        IF v_request_key IS NOT NULL THEN
            SELECT * INTO v_row FROM public.messages
            WHERE meeting_id = p_meeting_id AND request_key = v_request_key;
            IF FOUND THEN
                IF v_row.content IS DISTINCT FROM p_message->>'content'
                    OR v_row.sender_type IS DISTINCT FROM v_sender_type
                    OR v_row.sender_name IS DISTINCT FROM v_sender_name
                    OR v_row.sender_id IS DISTINCT FROM v_sender_id THEN
                    RETURN jsonb_build_object('outcome', 'conflict');
                END IF;
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
