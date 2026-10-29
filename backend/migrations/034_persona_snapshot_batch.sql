-- Batched persona creation snapshots (spec 20).
--
-- Meeting creation needs one coherent snapshot per requested template.
-- The single-template function (migration 015) takes the persona lock so
-- participant construction cannot observe a half-edited template; this
-- sibling does the same for a whole roster in ONE round trip, keeping
-- the per-persona snapshot shape byte-for-byte identical:
--
--   id, name, subtitle, color, avatar_url, provider_config,
--   is_default, user_id, created_at, updated_at,
--   active_prompt, active_prompt_version, stack_ids
--
-- Unknown ids are simply absent from the result; the application keeps
-- its all-or-nothing roster validation. Locks are acquired in id order
-- so concurrent creations cannot deadlock each other.

CREATE OR REPLACE FUNCTION public.read_persona_creation_snapshots(
    p_persona_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_snapshots JSONB;
BEGIN
    IF p_persona_ids IS NULL
       OR array_length(p_persona_ids, 1) IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    -- Snapshot coherence: lock every template before reading prompts or
    -- stack assignments, in a deterministic order.
    PERFORM p.id
    FROM public.personas AS p
    WHERE p.id = ANY(p_persona_ids)
    ORDER BY p.id
    FOR UPDATE;

    SELECT COALESCE(jsonb_agg(snapshot ORDER BY persona_id), '[]'::jsonb)
    INTO v_snapshots
    FROM (
        SELECT
            p.id AS persona_id,
            jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'subtitle', p.subtitle,
                'color', p.color,
                'avatar_url', p.avatar_url,
                'provider_config', p.provider_config,
                'is_default', p.is_default,
                'user_id', p.user_id,
                'created_at', p.created_at,
                'updated_at', p.updated_at,
                'active_prompt', prompt.content,
                'active_prompt_version', prompt.version,
                'stack_ids', COALESCE(stacks.stack_ids, ARRAY[]::uuid[])
            ) AS snapshot
        FROM public.personas AS p
        LEFT JOIN LATERAL (
            SELECT pv.content, pv.version
            FROM public.prompt_versions AS pv
            WHERE pv.persona_id = p.id AND pv.is_active
            ORDER BY pv.version DESC
            LIMIT 1
        ) AS prompt ON TRUE
        LEFT JOIN LATERAL (
            SELECT array_agg(pks.stack_id ORDER BY pks.stack_id) AS stack_ids
            FROM public.persona_knowledge_stacks AS pks
            WHERE pks.persona_id = p.id
        ) AS stacks ON TRUE
        WHERE p.id = ANY(p_persona_ids)
    ) AS rows;

    RETURN v_snapshots;
END;
$$;

-- --------------------------------------------------------------------------
-- Execution rights: backend service role only (013 posture).
-- --------------------------------------------------------------------------
DO $$
DECLARE
    target TEXT[] := ARRAY['read_persona_creation_snapshots'];
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
