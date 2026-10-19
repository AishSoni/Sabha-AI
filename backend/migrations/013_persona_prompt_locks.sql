-- Persona prompt locks + function execution permissions (spec 04).
--
-- Three hardenings the spec-04 permission audit required (findings recorded
-- with the spec-04 exit gate):
--
-- 1. PERSONA LOCK PROTOCOL: every prompt writer (revision allocation/save
--    and activation) now takes `SELECT ... FOR UPDATE` on the persona row
--    first. Under READ COMMITTED the row lock serializes concurrent writes
--    to one persona, so the deactivate/activate pair can no longer interleave
--    with a competing revision insert and leave zero or two active versions.
--
-- 2. FUNCTION EXECUTION RIGHTS: every RPC function previously carried
--    Postgres' default EXECUTE-to-PUBLIC, so any anon/authenticated client
--    could invoke the atomic persistence functions directly. EXECUTE is now
--    revoked from PUBLIC (and explicitly from anon/authenticated) and granted
--    to the backend service role only. Anonymous visitors keep using the
--    no-sign-in API; the functions are invoked with the backend credential.
--
-- 3. THE PERSONA TABLE FAMILY GAINS THE MIGRATION-009 POSTURE: RLS enabled
--    with read-only policies. Anonymous browser clients can read (shared
--    workspace stays open) but cannot write personas, prompt_versions,
--    persona_knowledge_stacks or knowledge_stacks directly even with table
--    grants.
--
-- All statements are idempotent and safe on fresh and upgraded databases.

-- --------------------------------------------------------------------------
-- 1) Prompt activation: persona lock first, then the selection flip.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- 1) Prompt activation: persona lock first, then the selection flip.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_prompt_version(p_persona_id UUID, p_version INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    PERFORM 1
    FROM public.personas
    WHERE id = p_persona_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.prompt_versions
        WHERE persona_id = p_persona_id AND version = p_version
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE public.prompt_versions
    SET is_active = (version = p_version)
    WHERE persona_id = p_persona_id;

    UPDATE public.personas
    SET updated_at = now()
    WHERE id = p_persona_id;
    RETURN TRUE;
END;
$$;

-- --------------------------------------------------------------------------
-- 2) Prompt revision creation: same persona lock covers version allocation.
--    Everything beyond the lock was already one transaction (007); the lock
--    keeps a concurrent activation from interleaving with the flip.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_prompt_version(
    p_persona_id UUID,
    p_content TEXT,
    p_version_id UUID,
    p_created_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_version INT;
    v_row public.prompt_versions;
BEGIN
    PERFORM 1
    FROM public.personas
    WHERE id = p_persona_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'persona_not_found';
    END IF;

    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.prompt_versions
    WHERE persona_id = p_persona_id;

    UPDATE public.prompt_versions
    SET is_active = FALSE
    WHERE persona_id = p_persona_id AND is_active;

    INSERT INTO public.prompt_versions (id, persona_id, version, content, is_active, created_at)
    VALUES (p_version_id, p_persona_id, v_version, p_content, TRUE, p_created_at)
    RETURNING * INTO v_row;

    UPDATE public.personas
    SET updated_at = now()
    WHERE id = p_persona_id;

    RETURN to_jsonb(v_row);
END;
$$;

-- --------------------------------------------------------------------------
-- 3) Function execution: no anonymous/browser bypass of atomic operations.
-- --------------------------------------------------------------------------
-- 3) Function execution: no anonymous/browser bypass of atomic operations.
--    Handles upgrade chains where a listed function does not exist yet and
--    clusters where the hosted-shaped roles were never created.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    seq record;
    target text[] := ARRAY[
        'activate_prompt_version',
        'create_prompt_version',
        'replace_persona_stacks',
        'create_meeting_transaction',
        'commit_meeting_ending',
        'record_inference_cost',
        'increment_meeting_cost'
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

-- ----------
-- 4) Persona family RLS: read everyone (no-sign-in shared workspace),
--    write backend-only. Mirrors migration 009's meeting-table posture.
-- ----------
DO $$ BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Backend managed writes" ON personas';
    EXECUTE 'DROP POLICY IF EXISTS "Backend managed writes" ON prompt_versions';
    EXECUTE 'DROP POLICY IF EXISTS "Backend managed writes" ON persona_knowledge_stacks';
    EXECUTE 'DROP POLICY IF EXISTS "Backend managed writes" ON knowledge_stacks';
END $$;

ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_knowledge_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_stacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backend managed writes" ON personas FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON prompt_versions FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON persona_knowledge_stacks FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON knowledge_stacks FOR SELECT USING (true);

GRANT SELECT ON personas TO PUBLIC;
GRANT SELECT ON prompt_versions TO PUBLIC;
GRANT SELECT ON persona_knowledge_stacks TO PUBLIC;
GRANT SELECT ON knowledge_stacks TO PUBLIC;
