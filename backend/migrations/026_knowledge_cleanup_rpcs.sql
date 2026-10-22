-- Knowledge cleanup and evidence attachment RPCs (spec 09).
--
-- Cleanup intents are written by knowledge_revoke_document in the same
-- transaction as the revocation. Physical cleanup (object storage, Qdrant,
-- retained passages) runs afterwards and is retried from the durable ledger.
-- Resolution is idempotent; failures keep the intent visible.
--
-- Evidence attachment closes the gap between the turn that retrieved a
-- passage and the published message that carries its tool artifacts. The
-- tool call identity is known while the tool runs; the final message id only
-- exists after publication.

CREATE OR REPLACE FUNCTION public.knowledge_resolve_cleanup(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.knowledge_cleanup
    SET resolved_at = COALESCE(resolved_at, NOW()),
        last_error = NULL,
        updated_at = NOW()
    WHERE id = p_id;

    RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.knowledge_note_cleanup_failure(
    p_id UUID,
    p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.knowledge_cleanup
    SET attempts = attempts + 1,
        last_error = p_error,
        updated_at = NOW()
    WHERE id = p_id
      AND resolved_at IS NULL;

    RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.knowledge_attach_evidence_message(
    p_operation_id UUID,
    p_tool_call_id TEXT,
    p_message_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.retrieved_passage_evidence
    SET message_id = p_message_id
    WHERE operation_id = p_operation_id
      AND tool_call_id IS NOT DISTINCT FROM p_tool_call_id
      AND message_id IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END $$;

DO $$
DECLARE
    target TEXT[] := ARRAY[
        'knowledge_resolve_cleanup',
        'knowledge_note_cleanup_failure',
        'knowledge_attach_evidence_message'
    ];
    seq RECORD;
BEGIN
    FOR seq IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY (target)
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
            seq.proname, seq.args
        );
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated',
                seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                seq.proname, seq.args
            );
        END IF;
    END LOOP;
END $$;
