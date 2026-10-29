-- Knowledge ingestion read (spec 20).
--
-- Upload observation previously cost three point queries (ingestion,
-- revision, document). The durable ingestion receipt is one logical read,
-- so it becomes one function: the round-trip budget is independent of how
-- many related rows a revision carries.
--
-- Returns NULL when the ingestion id is unknown; the object mirrors the
-- three rows the caller used to read so the record mapping stays explicit.

CREATE OR REPLACE FUNCTION public.knowledge_read_ingestion(p_ingestion_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'ingestion', jsonb_build_object(
            'id', i.id,
            'document_id', i.document_id,
            'revision_id', i.revision_id,
            'state', i.state,
            'last_error', i.last_error
        ),
        'revision', CASE
            WHEN r.id IS NULL THEN NULL
            ELSE jsonb_build_object(
                'status', r.status,
                'chunk_count', r.chunk_count,
                'error_message', r.error_message,
                'file_type', r.file_type,
                'qdrant_collection', r.qdrant_collection
            )
        END,
        'document', CASE
            WHEN d.id IS NULL THEN NULL
            ELSE jsonb_build_object(
                'file_name', d.file_name,
                'status', d.status,
                'chunk_count', d.chunk_count,
                'error_message', d.error_message
            )
        END
    )
    INTO v_result
    FROM public.document_ingestions AS i
    LEFT JOIN public.document_revisions AS r ON r.id = i.revision_id
    LEFT JOIN public.documents AS d ON d.id = i.document_id
    WHERE i.id = p_ingestion_id;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- Execution rights: backend service role only (013 posture).
-- --------------------------------------------------------------------------
DO $$
DECLARE
    target TEXT[] := ARRAY['knowledge_read_ingestion'];
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
