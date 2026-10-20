-- Persona catalog transactional surface (spec 06).
--
-- The catalog module owns template CRUD and the coherent
-- participant-creation snapshot. Three functions, all idempotent and
-- safe on fresh and upgraded databases:
--
-- 1. read_persona_creation_snapshot: ONE call returning the template
--    row + its active prompt + its stack assignment ids, taken under
--    the persona lock so a meeting's participant construction cannot
--    observe a half-edited template. NULL means unknown persona.
--
-- 2. create_persona_transaction: persona row + initial prompt version
--    + knowledge-stack assignments in one transaction. Unknown stack
--    ids abort with nothing persisted; a mid-transaction failure (e.g.
--    a prompt id collision) rolls the template back again.
--
-- 3. update_persona_transaction: guarded metadata/assignment update.
--    Null parameters mean "leave unchanged" (provider_config included),
--    p_stack_ids NULL keeps assignments / [] clears / a list replaces
--    (validated BEFORE the delete like migration 005). The optional
--    p_expected_updated_at is the optimistic-concurrency guard: a
--    mismatch raises 'persona_edit_conflict' with the previous state
--    preserved; NULL keeps unconditional legacy writes working.

-- --------------------------------------------------------------------------
-- 1) Coherent creation snapshot (personal-lock protocol reads)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION read_persona_creation_snapshot(p_persona_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_persona public.personas;
    v_prompt public.prompt_versions;
    v_stack_ids UUID[];
BEGIN
    -- Snapshot coherence: the persona lock serializes reads against
    -- prompt activation and metadata edits on this template.
    SELECT * INTO v_persona
    FROM public.personas
    WHERE id = p_persona_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_prompt
    FROM public.prompt_versions
    WHERE persona_id = p_persona_id AND is_active
    ORDER BY version DESC
    LIMIT 1;

    SELECT COALESCE(
        array_agg(pks.stack_id ORDER BY pks.stack_id),
        ARRAY[]::uuid[]
    ) INTO v_stack_ids
    FROM public.persona_knowledge_stacks AS pks
    WHERE pks.persona_id = p_persona_id;

    RETURN jsonb_build_object(
        'id', v_persona.id,
        'name', v_persona.name,
        'subtitle', v_persona.subtitle,
        'color', v_persona.color,
        'avatar_url', v_persona.avatar_url,
        'provider_config', v_persona.provider_config,
        'is_default', v_persona.is_default,
        'user_id', v_persona.user_id,
        'created_at', v_persona.created_at,
        'updated_at', v_persona.updated_at,
        'active_prompt', v_prompt.content,
        'active_prompt_version', v_prompt.version,
        'stack_ids', v_stack_ids
    );
END;
$$;

-- --------------------------------------------------------------------------
-- 2) Atomic template creation
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_persona_transaction(
    p_persona_id UUID,
    p_name TEXT,
    p_subtitle TEXT,
    p_color TEXT,
    p_avatar_url TEXT,
    p_provider_config JSONB,
    p_is_default BOOLEAN,
    p_user_id TEXT,
    p_prompt_id UUID,
    p_system_prompt TEXT,
    p_created_at TIMESTAMPTZ,
    p_stack_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_row public.personas;
    unknown_ids UUID[];
BEGIN
    -- Validate every referenced stack BEFORE persisting anything.
    SELECT COALESCE(array_agg(sid), ARRAY[]::uuid[]) INTO unknown_ids
    FROM UNNEST(COALESCE(p_stack_ids, ARRAY[]::uuid[])) AS sid
    WHERE sid NOT IN (SELECT id FROM public.knowledge_stacks);

    IF array_length(unknown_ids, 1) > 0 THEN
        RAISE EXCEPTION 'unknown_knowledge_stacks' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.personas
        (id, name, subtitle, color, avatar_url,
         provider_config, is_default, user_id, created_at, updated_at)
    VALUES
        (p_persona_id, p_name, p_subtitle, p_color, p_avatar_url,
         p_provider_config, p_is_default, p_user_id,
         p_created_at, p_created_at)
    RETURNING * INTO v_row;

    IF p_system_prompt IS NOT NULL THEN
        INSERT INTO public.prompt_versions
            (id, persona_id, version, content, is_active, created_at)
        VALUES
            (p_prompt_id, p_persona_id, 1, p_system_prompt, TRUE, p_created_at);
    END IF;

    INSERT INTO public.persona_knowledge_stacks (persona_id, stack_id)
    SELECT DISTINCT p_persona_id, sid
    FROM UNNEST(COALESCE(p_stack_ids, ARRAY[]::uuid[])) AS sid;

    RETURN to_jsonb(v_row);
END;
$$;

-- --------------------------------------------------------------------------
-- 3) Guarded metadata/assignment update
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_persona_transaction(
    p_persona_id UUID,
    p_name TEXT,
    p_subtitle TEXT,
    p_color TEXT,
    p_avatar_url TEXT,
    p_provider_config JSONB,
    p_stack_ids UUID[],
    p_expected_updated_at TIMESTAMPTZ,
    p_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_current public.personas;
    v_row public.personas;
    unknown_ids UUID[];
BEGIN
    -- Persona lock first (same protocol as the prompt writers, 013).
    SELECT * INTO v_current
    FROM public.personas
    WHERE id = p_persona_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'persona_not_found';
    END IF;

    -- Optimistic-concurrency guard: refusing here leaves the previous
    -- state intact for the caller to re-read. NULL keeps the
    -- unconditional legacy write path.
    IF p_expected_updated_at IS NOT NULL
       AND v_current.updated_at <> p_expected_updated_at THEN
        RAISE EXCEPTION 'persona_edit_conflict';
    END IF;

    IF p_stack_ids IS NOT NULL THEN
        -- Validate before deleting anything; a failed replacement must
        -- leave prior assignments intact.
        SELECT COALESCE(array_agg(sid), ARRAY[]::uuid[]) INTO unknown_ids
        FROM UNNEST(p_stack_ids) AS sid
        WHERE sid NOT IN (SELECT id FROM public.knowledge_stacks);

        IF array_length(unknown_ids, 1) > 0 THEN
            RAISE EXCEPTION 'unknown_knowledge_stacks' USING ERRCODE = '23503';
        END IF;

        DELETE FROM public.persona_knowledge_stacks
        WHERE persona_id = p_persona_id;

        INSERT INTO public.persona_knowledge_stacks (persona_id, stack_id)
        SELECT DISTINCT p_persona_id, sid
        FROM UNNEST(p_stack_ids) AS sid;
    END IF;

    UPDATE public.personas
    SET name            = COALESCE(p_name, name),
        subtitle        = COALESCE(p_subtitle, subtitle),
        color           = COALESCE(p_color, color),
        avatar_url      = COALESCE(p_avatar_url, avatar_url),
        provider_config = COALESCE(p_provider_config, provider_config),
        updated_at      = COALESCE(p_updated_at, now())
    WHERE id = p_persona_id
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

-- --------------------------------------------------------------------------
-- Function execution rights: backend service role only (013 posture).
-- --------------------------------------------------------------------------
DO $$
DECLARE
    seq record;
    target text[] := ARRAY[
        'read_persona_creation_snapshot',
        'create_persona_transaction',
        'update_persona_transaction'
    ];
BEGIN
    FOR seq IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY(target)
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', seq.proname, seq.args
        );
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', seq.proname, seq.args
            );
        END IF;
    END LOOP;
END $$;
