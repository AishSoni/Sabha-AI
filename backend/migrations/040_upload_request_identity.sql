-- Spec 36 / T04: one upload intent admits one document.
--
-- A lost upload response must be recoverable by the stable request key the
-- browser retained. Replaying the same key with the same authorized bytes
-- returns the original ingestion. Reusing the key for different bytes, a
-- different owner, or different file identity is a conflict rather than a
-- second admission or a false acknowledgement. Requests without a key keep
-- the legacy ingestion-id recovery path.

ALTER TABLE public.document_ingestions
    ADD COLUMN IF NOT EXISTS request_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS one_upload_per_request_key
    ON public.document_ingestions (request_key)
    WHERE request_key IS NOT NULL;

-- Replace the 15-argument admission rather than adding an overload: a
-- defaulted 16th argument would make 15-argument calls ambiguous.
DROP FUNCTION IF EXISTS public.knowledge_admit_upload(
    UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT,
    TEXT, TEXT, INTEGER
);

CREATE OR REPLACE FUNCTION public.knowledge_admit_upload(
    p_document_id UUID,
    p_revision_id UUID,
    p_ingestion_id UUID,
    p_meeting_id UUID,
    p_persona_id UUID,
    p_stack_id UUID,
    p_file_name TEXT,
    p_file_type TEXT,
    p_file_size_bytes BIGINT,
    p_collection_name TEXT,
    p_source_key TEXT,
    p_source_sha256 TEXT,
    p_embedding_provider TEXT,
    p_embedding_model TEXT,
    p_embedding_dimension INTEGER,
    p_request_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_owner_count INTEGER;
    v_existing public.document_ingestions;
    v_request_existing public.document_ingestions;
    v_request_document public.documents;
    v_request_key TEXT;
BEGIN
    v_request_key := NULLIF(BTRIM(p_request_key), '');

    -- Serialize replays of one intent. The unique index remains the final
    -- authority; this lock makes the read-then-insert path deterministic.
    IF v_request_key IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('knowledge-upload:' || v_request_key));
    END IF;

    IF v_request_key IS NOT NULL THEN
        SELECT * INTO v_request_existing
        FROM public.document_ingestions
        WHERE request_key = v_request_key;

        IF FOUND THEN
            SELECT * INTO v_request_document
            FROM public.documents
            WHERE id = v_request_existing.document_id;

            IF v_request_existing.document_id IS DISTINCT FROM p_document_id
               OR v_request_existing.revision_id IS DISTINCT FROM p_revision_id
               OR v_request_document.id IS NULL
               OR v_request_document.meeting_id IS DISTINCT FROM p_meeting_id
               OR v_request_document.persona_id IS DISTINCT FROM p_persona_id
               OR v_request_document.stack_id IS DISTINCT FROM p_stack_id
               OR v_request_document.file_name IS DISTINCT FROM p_file_name
               OR v_request_document.file_type IS DISTINCT FROM p_file_type
               OR v_request_document.file_size_bytes IS DISTINCT FROM p_file_size_bytes
               OR NOT EXISTS (
                   SELECT 1
                   FROM public.document_revisions AS r
                   WHERE r.id = v_request_existing.revision_id
                     AND r.source_sha256 IS NOT DISTINCT FROM p_source_sha256
               ) THEN
                RETURN jsonb_build_object('outcome', 'conflict');
            END IF;

            RETURN jsonb_build_object(
                'outcome', 'existing',
                'document_id', v_request_existing.document_id,
                'revision_id', v_request_existing.revision_id,
                'ingestion_id', v_request_existing.id,
                'state', v_request_existing.state
            );
        END IF;
    END IF;

    SELECT * INTO v_existing
    FROM public.document_ingestions
    WHERE id = p_ingestion_id;

    IF FOUND THEN
        IF v_existing.document_id <> p_document_id
           OR v_existing.revision_id <> p_revision_id
           OR (v_request_key IS NOT NULL
               AND v_existing.request_key IS NOT NULL
               AND v_existing.request_key <> v_request_key) THEN
            RETURN jsonb_build_object('outcome', 'conflict');
        END IF;
        RETURN jsonb_build_object(
            'outcome', 'existing',
            'document_id', v_existing.document_id,
            'revision_id', v_existing.revision_id,
            'ingestion_id', v_existing.id,
            'state', v_existing.state
        );
    END IF;

    v_owner_count :=
        (CASE WHEN p_meeting_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p_persona_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p_stack_id IS NOT NULL THEN 1 ELSE 0 END);

    IF v_owner_count <> 1 THEN
        RAISE EXCEPTION 'exactly one knowledge owner is required';
    END IF;
    IF p_file_size_bytes IS NULL OR p_file_size_bytes <= 0 THEN
        RAISE EXCEPTION 'file size must be positive';
    END IF;
    IF p_file_size_bytes > 52428800 THEN
        RAISE EXCEPTION 'file exceeds the 50 MiB source budget';
    END IF;
    IF p_source_sha256 IS NULL OR length(p_source_sha256) <> 64 THEN
        RAISE EXCEPTION 'source sha256 must be 64 hex characters';
    END IF;
    IF p_source_key IS NULL OR length(p_source_key) = 0 THEN
        RAISE EXCEPTION 'source key is required';
    END IF;
    IF p_collection_name IS NULL OR length(p_collection_name) = 0 THEN
        RAISE EXCEPTION 'collection name is required';
    END IF;

    INSERT INTO public.documents (
        id, meeting_id, persona_id, stack_id,
        file_name, file_type, file_size_bytes,
        chunk_count, qdrant_collection, status
    ) VALUES (
        p_document_id, p_meeting_id, p_persona_id, p_stack_id,
        p_file_name, p_file_type, p_file_size_bytes,
        0, p_collection_name, 'processing'
    );

    INSERT INTO public.document_revisions (
        id, document_id, revision_number, status,
        source_key, source_sha256, source_size_bytes, file_type,
        qdrant_collection, embedding_provider, embedding_model,
        embedding_dimension
    ) VALUES (
        p_revision_id, p_document_id, 1, 'pending',
        p_source_key, p_source_sha256, p_file_size_bytes, p_file_type,
        p_collection_name, p_embedding_provider, p_embedding_model,
        p_embedding_dimension
    );

    INSERT INTO public.document_ingestions (
        id, document_id, revision_id, state, request_key
    ) VALUES (
        p_ingestion_id, p_document_id, p_revision_id, 'pending', v_request_key
    );

    RETURN jsonb_build_object(
        'outcome', 'admitted',
        'document_id', p_document_id,
        'revision_id', p_revision_id,
        'ingestion_id', p_ingestion_id,
        'state', 'pending'
    );
END $$;

-- Look up a retained upload intent by key and owner. The same response shape
-- as knowledge_read_ingestion keeps the browser observation path identical.
CREATE OR REPLACE FUNCTION public.knowledge_read_upload_request(
    p_request_key TEXT,
    p_meeting_id UUID,
    p_persona_id UUID,
    p_stack_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_result JSONB;
    v_request_key TEXT;
BEGIN
    v_request_key := NULLIF(BTRIM(p_request_key), '');
    IF v_request_key IS NULL OR (
        (CASE WHEN p_meeting_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p_persona_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p_stack_id IS NOT NULL THEN 1 ELSE 0 END)
    ) <> 1 THEN
        RETURN NULL;
    END IF;

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
    WHERE i.request_key = v_request_key
      AND d.meeting_id IS NOT DISTINCT FROM p_meeting_id
      AND d.persona_id IS NOT DISTINCT FROM p_persona_id
      AND d.stack_id IS NOT DISTINCT FROM p_stack_id;

    RETURN v_result;
END;
$$;

-- --------------------------------------------------------------------------
-- Execution rights: backend service role only (013 posture).
-- --------------------------------------------------------------------------
DO $$
DECLARE
    target TEXT[] := ARRAY[
        'knowledge_admit_upload',
        'knowledge_read_upload_request'
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
