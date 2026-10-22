-- Parent knowledge deletion also records the collection cleanup intent.
--
-- Version 025 revokes every document owned by a meeting/stack/persona, but an
-- empty parent (no documents) still owns a vector collection. This replaces
-- the function so the parent collection is recorded as a durable cleanup
-- intent before the parent row is deleted and the documents cascade.

CREATE OR REPLACE FUNCTION public.knowledge_revoke_parent(
    p_parent_kind TEXT,
    p_parent_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_document UUID;
    v_count INTEGER := 0;
    v_result JSONB;
    v_collection TEXT;
BEGIN
    IF p_parent_kind NOT IN ('meeting', 'stack', 'persona') THEN
        RAISE EXCEPTION 'unsupported knowledge parent %', p_parent_kind;
    END IF;

    IF p_parent_kind = 'meeting' THEN
        v_collection := 'meeting_' || p_parent_id::TEXT || '_shared';
    ELSE
        v_collection := p_parent_kind || '_' || p_parent_id::TEXT || '_knowledge';
    END IF;

    INSERT INTO public.knowledge_cleanup (
        target_kind, target_id, collection_name, reason
    ) VALUES (
        'vector_collection', p_parent_id, v_collection, p_reason
    )
    ON CONFLICT (target_kind, target_id) DO NOTHING;

    FOR v_document IN
        SELECT id FROM public.documents
        WHERE (p_parent_kind = 'meeting' AND meeting_id = p_parent_id)
           OR (p_parent_kind = 'stack' AND stack_id = p_parent_id)
           OR (p_parent_kind = 'persona' AND persona_id = p_parent_id)
    LOOP
        v_result := public.knowledge_revoke_document(v_document, p_reason);
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'outcome', 'revoked',
        'documents', v_count,
        'collection_name', v_collection
    );
END $$;

REVOKE ALL ON FUNCTION public.knowledge_revoke_parent(TEXT, UUID, TEXT)
    FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.knowledge_revoke_parent(TEXT, UUID, TEXT)
            FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.knowledge_revoke_parent(TEXT, UUID, TEXT)
            FROM authenticated;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.knowledge_revoke_parent(TEXT, UUID, TEXT)
            TO service_role;
    END IF;
END $$;
