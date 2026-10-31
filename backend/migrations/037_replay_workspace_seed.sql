-- Replay workspace seed storage (spec-23).
--
-- The expanded demo workspace seed is inert authoring data referenced by a
-- schema-2 replay package. It is stored beside the immutable package rows and
-- exposed only through a published-only runtime view. The runtime reader never
-- sees staged or retired-unpublished rows, and never reads a live catalog table.

CREATE TABLE IF NOT EXISTS replay.workspace_seed (
    package_id text NOT NULL,
    version text NOT NULL,
    seed_version integer NOT NULL CHECK (seed_version > 0),
    payload jsonb NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (package_id, version),
    FOREIGN KEY (package_id, version)
        REFERENCES replay.package (package_id, version) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW replay.v_published_workspace_seed AS
SELECT s.package_id, s.version, s.seed_version, s.payload, s.sha256
FROM replay.workspace_seed s
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

REVOKE ALL ON replay.workspace_seed FROM PUBLIC;
DO $$
DECLARE
    role_name text;
BEGIN
    FOR role_name IN
        SELECT rolname FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
        EXECUTE format(
            'REVOKE ALL ON replay.workspace_seed FROM %I', role_name
        );
    END LOOP;
END $$;

GRANT SELECT ON replay.v_published_workspace_seed TO sabha_replay_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON replay.workspace_seed
    TO sabha_replay_provisioner;
