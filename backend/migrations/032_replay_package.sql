-- Replay package storage (spec-17).
--
-- Packages are inert, immutable records published by the offline tool. The
-- runtime reader never sees staged rows: every runtime view filters on
-- ``published_at IS NOT NULL``. Retired versions stay readable so runs pinned
-- to an older version keep working until retention removes the rows.
--
-- The replay roles are cluster-level and must be provisioned first:
--
--     python -m scripts.replay_roles
--
-- Reader access is granted only on the ``v_published_*`` views, never on the
-- base tables. Publication uses the separate offline provisioner credential.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sabha_replay_reader')
       OR NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sabha_replay_provisioner') THEN
        RAISE EXCEPTION
            'replay roles are missing: run python -m scripts.replay_roles before applying 032';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'replay') THEN
        RAISE EXCEPTION
            'replay schema is missing: run python -m scripts.replay_roles before applying 032';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS replay.package (
    package_id text NOT NULL,
    version text NOT NULL,
    schema_version integer NOT NULL,
    read_version integer NOT NULL,
    event_version integer NOT NULL,
    content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    meeting_id text NOT NULL,
    title text NOT NULL,
    as_of date NOT NULL,
    label text NOT NULL,
    manifest jsonb NOT NULL,
    status text NOT NULL DEFAULT 'staged'
        CHECK (status IN ('staged', 'published', 'retired')),
    published_at timestamptz,
    retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (package_id, version)
);

CREATE INDEX IF NOT EXISTS replay_package_meeting_idx
    ON replay.package (meeting_id);

CREATE TABLE IF NOT EXISTS replay.package_registry (
    package_id text PRIMARY KEY,
    active_version text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (package_id, active_version)
        REFERENCES replay.package (package_id, version)
);

CREATE TABLE IF NOT EXISTS replay.checkpoint (
    package_id text NOT NULL,
    version text NOT NULL,
    checkpoint_id text NOT NULL,
    ordinal integer NOT NULL CHECK (ordinal >= 0),
    phase text NOT NULL
        CHECK (phase IN ('initial', 'active', 'completed', 'closed', 'archived')),
    bundle jsonb NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    PRIMARY KEY (package_id, version, checkpoint_id),
    FOREIGN KEY (package_id, version)
        REFERENCES replay.package (package_id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS replay.turn_tape (
    package_id text NOT NULL,
    version text NOT NULL,
    tape_id text NOT NULL,
    meeting_id text NOT NULL,
    operation_id text NOT NULL,
    participant_id text NOT NULL,
    request_key text NOT NULL,
    initial_checkpoint text NOT NULL,
    completed_checkpoint text NOT NULL,
    PRIMARY KEY (package_id, version, tape_id),
    UNIQUE (package_id, version, operation_id),
    FOREIGN KEY (package_id, version)
        REFERENCES replay.package (package_id, version) ON DELETE CASCADE,
    FOREIGN KEY (package_id, version, initial_checkpoint)
        REFERENCES replay.checkpoint (package_id, version, checkpoint_id),
    FOREIGN KEY (package_id, version, completed_checkpoint)
        REFERENCES replay.checkpoint (package_id, version, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS replay.turn_event (
    package_id text NOT NULL,
    version text NOT NULL,
    tape_id text NOT NULL,
    event_id text NOT NULL,
    sequence integer NOT NULL CHECK (sequence > 0),
    type text NOT NULL,
    payload jsonb NOT NULL,
    delay_ms integer NOT NULL DEFAULT 0 CHECK (delay_ms >= 0),
    PRIMARY KEY (package_id, version, tape_id, event_id),
    UNIQUE (package_id, version, tape_id, sequence),
    FOREIGN KEY (package_id, version, tape_id)
        REFERENCES replay.turn_tape (package_id, version, tape_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS replay.closing_tape (
    package_id text NOT NULL,
    version text NOT NULL,
    tape_id text NOT NULL,
    meeting_id text NOT NULL,
    closing_id text NOT NULL,
    initial_checkpoint text NOT NULL,
    completed_checkpoint text NOT NULL,
    PRIMARY KEY (package_id, version, tape_id),
    FOREIGN KEY (package_id, version)
        REFERENCES replay.package (package_id, version) ON DELETE CASCADE,
    FOREIGN KEY (package_id, version, completed_checkpoint)
        REFERENCES replay.checkpoint (package_id, version, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS replay.closing_event (
    package_id text NOT NULL,
    version text NOT NULL,
    tape_id text NOT NULL,
    event_id text NOT NULL,
    sequence integer NOT NULL CHECK (sequence > 0),
    item_id text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('ballot', 'summary')),
    payload jsonb NOT NULL,
    delay_ms integer NOT NULL DEFAULT 0 CHECK (delay_ms >= 0),
    PRIMARY KEY (package_id, version, tape_id, event_id),
    UNIQUE (package_id, version, tape_id, sequence),
    FOREIGN KEY (package_id, version, tape_id)
        REFERENCES replay.closing_tape (package_id, version, tape_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS replay.retrieval_record (
    package_id text NOT NULL,
    version text NOT NULL,
    retrieval_key text NOT NULL,
    meeting_id text NOT NULL,
    participant_id text NOT NULL,
    scope text NOT NULL CHECK (scope IN ('shared', 'private')),
    stack_id text,
    query text NOT NULL DEFAULT '',
    hits jsonb NOT NULL,
    PRIMARY KEY (package_id, version, retrieval_key),
    FOREIGN KEY (package_id, version)
        REFERENCES replay.package (package_id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS replay.asset (
    package_id text NOT NULL,
    version text NOT NULL,
    asset_id text NOT NULL,
    storage_path text NOT NULL,
    media_type text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    locator text NOT NULL,
    public_url text NOT NULL,
    source text NOT NULL,
    capture_date date NOT NULL,
    rights text NOT NULL,
    authored boolean NOT NULL,
    public_demo boolean NOT NULL,
    extraction text,
    PRIMARY KEY (package_id, version, asset_id),
    UNIQUE (package_id, version, storage_path),
    FOREIGN KEY (package_id, version)
        REFERENCES replay.package (package_id, version) ON DELETE CASCADE
);

-- Runtime views: staged rows are invisible; published and retired rows are
-- readable so a pinned run keeps its package after replacement.
CREATE OR REPLACE VIEW replay.v_published_package AS
SELECT p.package_id, p.version, p.schema_version, p.read_version,
       p.event_version, p.content_sha256, p.meeting_id, p.title, p.as_of,
       p.label, p.manifest, p.status, p.published_at, p.retired_at
FROM replay.package p
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_checkpoint AS
SELECT c.package_id, c.version, c.checkpoint_id, c.ordinal, c.phase,
       c.bundle, c.sha256
FROM replay.checkpoint c
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_turn_tape AS
SELECT t.package_id, t.version, t.tape_id, t.meeting_id, t.operation_id,
       t.participant_id, t.request_key, t.initial_checkpoint,
       t.completed_checkpoint
FROM replay.turn_tape t
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_turn_event AS
SELECT e.package_id, e.version, e.tape_id, e.event_id, e.sequence, e.type,
       e.payload, e.delay_ms
FROM replay.turn_event e
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_closing_tape AS
SELECT t.package_id, t.version, t.tape_id, t.meeting_id, t.closing_id,
       t.initial_checkpoint, t.completed_checkpoint
FROM replay.closing_tape t
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_closing_event AS
SELECT e.package_id, e.version, e.tape_id, e.event_id, e.sequence, e.item_id,
       e.kind, e.payload, e.delay_ms
FROM replay.closing_event e
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_retrieval AS
SELECT r.package_id, r.version, r.retrieval_key, r.meeting_id,
       r.participant_id, r.scope, r.stack_id, r.query, r.hits
FROM replay.retrieval_record r
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_published_asset AS
SELECT a.package_id, a.version, a.asset_id, a.storage_path, a.media_type,
       a.sha256, a.size_bytes, a.locator, a.public_url, a.source,
       a.capture_date, a.rights, a.authored, a.public_demo, a.extraction
FROM replay.asset a
JOIN replay.package p USING (package_id, version)
WHERE p.published_at IS NOT NULL;

CREATE OR REPLACE VIEW replay.v_package_registry AS
SELECT r.package_id, r.active_version, p.content_sha256, p.meeting_id, p.label
FROM replay.package_registry r
JOIN replay.package p
  ON p.package_id = r.package_id AND p.version = r.active_version
WHERE p.status = 'published' AND p.published_at IS NOT NULL;

-- Close every runtime view to PUBLIC and to browser-facing roles.
REVOKE ALL ON ALL TABLES IN SCHEMA replay FROM PUBLIC;
DO $$
DECLARE
    role_name text;
BEGIN
    FOR role_name IN
        SELECT rolname FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
        EXECUTE format(
            'REVOKE ALL ON ALL TABLES IN SCHEMA replay FROM %I', role_name
        );
    END LOOP;
END $$;

GRANT SELECT ON replay.v_published_package,
                replay.v_published_checkpoint,
                replay.v_published_turn_tape,
                replay.v_published_turn_event,
                replay.v_published_closing_tape,
                replay.v_published_closing_event,
                replay.v_published_retrieval,
                replay.v_published_asset,
                replay.v_package_registry
    TO sabha_replay_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA replay
    TO sabha_replay_provisioner;
