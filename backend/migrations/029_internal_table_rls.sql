-- Internal-table RLS backfill (security advisory: "RLS disabled in public").
--
-- Four tables predate the "internal table" convention established by 014 and
-- followed by 018, 020, 025 and 028, so they were created with RLS off:
--
--   documents              (000 baseline) — the rest of the knowledge family
--                          around it (document_revisions, document_chunks, ...)
--                          is already backend-only
--   inference_events       (011) — the ledger behind meetings.total_cost
--   pending_vector_cleanup (012) — the retry queue that drops Qdrant
--                          collections; reconciliation replays collection_name
--                          verbatim, so an anonymous INSERT here is a deletion
--                          primitive for any collection the backend can reach
--   schema_migrations      (scripts/migrate.py) — created by the migration
--                          runner, not by a migration file
--
-- Nothing outside the backend reads them: the browser talks to FastAPI only,
-- and FastAPI connects as service_role, which carries BYPASSRLS on hosted
-- Supabase (the same role signature the 013/014/025 permission tests assert).
-- RLS is therefore enabled with NO policy — default-deny is the whole rule
-- set — and the table grants are revoked as well, so stacks whose default
-- privileges are narrower or wider behave identically.
--
-- schema_migrations is guarded by to_regclass: the runner creates it, so it is
-- absent in test fixtures that apply the schema files directly.
--
-- Safe to re-run.
--
-- Rollback (manual, restores the advisory):
--   ALTER TABLE public.documents DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.inference_events DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.pending_vector_cleanup DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.schema_migrations DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inference_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_vector_cleanup ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.documents FROM PUBLIC;
REVOKE ALL ON TABLE public.inference_events FROM PUBLIC;
REVOKE ALL ON TABLE public.pending_vector_cleanup FROM PUBLIC;

DO $$
DECLARE
    targets TEXT[] := ARRAY[
        'public.documents',
        'public.inference_events',
        'public.pending_vector_cleanup'
    ];
    target TEXT;
BEGIN
    FOREACH target IN ARRAY targets LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON TABLE %s FROM anon', target);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON TABLE %s FROM authenticated', target);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT ALL ON TABLE %s TO service_role', target);
        END IF;
    END LOOP;
END
$$;

DO $$
BEGIN
    IF to_regclass('public.schema_migrations') IS NULL THEN
        RETURN;
    END IF;
    EXECUTE 'ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.schema_migrations FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.schema_migrations FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.schema_migrations FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON TABLE public.schema_migrations TO service_role';
    END IF;
END
$$;
