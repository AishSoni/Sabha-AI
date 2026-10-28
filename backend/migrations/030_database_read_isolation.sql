-- Database read isolation (Spec 12).
--
-- Migration 009 replaced the baseline's FOR ALL policies with SELECT-only
-- policies and granted SELECT to PUBLIC on the five meeting tables. Migration
-- 013 repeated the pattern for personas, prompt versions and knowledge stacks.
-- The result was a contradiction: an anonymous browser key could read every
-- live meeting, persona and stack, even though it could not write. A role
-- granted nothing at all inherited the same reads through PUBLIC.
--
-- The application does not need those grants. The browser talks to FastAPI
-- only, and FastAPI connects with SUPABASE_SERVICE_KEY; the direct Supabase
-- client is not used by the frontend. This migration therefore:
--
--   1. removes every live table/view/sequence/function privilege from PUBLIC,
--      anon and authenticated in the public schema;
--   2. drops the nine SELECT-true "Backend managed writes" policies, so a
--      future re-grant cannot silently restore all-row reads;
--   3. removes schema USAGE and CREATE from PUBLIC, anon and authenticated;
--   4. grants the live backend (service_role, when present) exactly what it
--      needs: schema USAGE, DML on tables, sequence use, RPC execution;
--   5. records safe default privileges for objects the migration owner creates
--      later: PUBLIC/anon/authenticated stay closed, service_role keeps the
--      backend capability.
--
-- The knowledge/settings/internal protections added by 025-029 are left in
-- place and are re-asserted by the revokes above. Nothing here touches the
-- storage schema or any hosted-managed schema.
--
-- Every role reference is guarded so the migration also runs on a plain
-- PostgreSQL cluster that has no Supabase roles. Re-running the migration is
-- safe: revokes and policy drops are idempotent, grants are idempotent, and
-- ALTER DEFAULT PRIVILEGES replaces the same entries.
--
-- Rollback (manual, restores the previous public-read model):
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO PUBLIC;
--   GRANT USAGE ON SCHEMA public TO PUBLIC;
--   CREATE POLICY "Backend managed writes" ON ... FOR SELECT USING (true);
-- A schema rollback still means restoring a verified backup; there is no down
-- migration in the ordered history.

-- 1. Schema entry point -------------------------------------------------------

REVOKE ALL ON SCHEMA public FROM PUBLIC;

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
                'REVOKE ALL ON SCHEMA public FROM %I', role_name
            );
        END IF;
    END LOOP;
END $$;

-- 2. Existing live objects ----------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
                'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', role_name
            );
            EXECUTE format(
                'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name
            );
            EXECUTE format(
                'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name
            );
        END IF;
    END LOOP;
END $$;

-- 3. Remove the legacy all-row read policies ---------------------------------

DROP POLICY IF EXISTS "Backend managed writes" ON public.meetings;
DROP POLICY IF EXISTS "Backend managed writes" ON public.ai_participants;
DROP POLICY IF EXISTS "Backend managed writes" ON public.messages;
DROP POLICY IF EXISTS "Backend managed writes" ON public.disagreements;
DROP POLICY IF EXISTS "Backend managed writes" ON public.consensus;
DROP POLICY IF EXISTS "Backend managed writes" ON public.personas;
DROP POLICY IF EXISTS "Backend managed writes" ON public.prompt_versions;
DROP POLICY IF EXISTS "Backend managed writes" ON public.persona_knowledge_stacks;
DROP POLICY IF EXISTS "Backend managed writes" ON public.knowledge_stacks;

-- 4. Restore the live backend capability -------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT USAGE ON SCHEMA public TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON ALL TABLES IN SCHEMA public TO service_role;
        GRANT USAGE, SELECT
            ON ALL SEQUENCES IN SCHEMA public TO service_role;
        GRANT EXECUTE
            ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    END IF;
END $$;

-- 5. Safe defaults for future objects created by the migration owner --------

DO $$
DECLARE
    owner_name TEXT := current_user;
    role_name TEXT;
BEGIN
    -- Roles that exist on hosted Supabase but not on a bare test cluster.
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                'REVOKE ALL ON TABLES FROM %I',
                owner_name, role_name
            );
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                'REVOKE ALL ON SEQUENCES FROM %I',
                owner_name, role_name
            );
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
                'REVOKE ALL ON FUNCTIONS FROM %I',
                owner_name, role_name
            );
        END IF;
    END LOOP;

    -- PUBLIC is a pseudo-role and always exists.
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE ALL ON TABLES FROM PUBLIC',
        owner_name
    );
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE ALL ON SEQUENCES FROM PUBLIC',
        owner_name
    );
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE ALL ON FUNCTIONS FROM PUBLIC',
        owner_name
    );
    -- Follow Supabase's guidance: revoke the global function default as well,
    -- because schema-level defaults are additive to the global entry.
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I '
        'REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
        owner_name
    );

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role',
            owner_name
        );
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'GRANT USAGE, SELECT ON SEQUENCES TO service_role',
            owner_name
        );
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
            'GRANT EXECUTE ON FUNCTIONS TO service_role',
            owner_name
        );
    END IF;
END $$;
