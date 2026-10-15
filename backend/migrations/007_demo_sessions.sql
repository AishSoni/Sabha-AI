-- Demo Sessions Schema Migration (Phase 08)
-- Run this in Supabase SQL Editor
--
-- Persistent demo-session lifecycle for the fixture-only runtime.
-- Row-Level Security stays disabled by policy (application layer is the
-- ownership control; see specs/evidence/phase-08.md). The service-role
-- gateway (`SupabaseGateway`) owns these rows; no end-user key touches
-- this table. Records hold identifiers and counters only: token hashes
-- (never raw tokens), generation, scenario binding, activity timestamps,
-- action/write counters, and bounded idempotency history.

-- ============================================
-- DEMO SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS demo_sessions (
    session_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    generation INT NOT NULL DEFAULT 1,
    scenario_id TEXT NOT NULL,
    scenario_revision INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_count INT NOT NULL DEFAULT 0,
    active_turn_id TEXT,
    creation_key TEXT NOT NULL DEFAULT 'anonymous',
    write_times TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
    reset_keys JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup by presented-token hash (the only read path).
CREATE INDEX IF NOT EXISTS idx_demo_sessions_token_hash
    ON demo_sessions(token_hash);

-- Retention sweep: expired by idle or absolute deadline.
CREATE INDEX IF NOT EXISTS idx_demo_sessions_expiry
    ON demo_sessions(expires_at, last_active_at);

-- Synthetic-only guard at the storage boundary (defense in depth; the
-- application validates first and the manifest type rejects the rest).
ALTER TABLE demo_sessions DROP CONSTRAINT IF EXISTS demo_sessions_synthetic_only;
ALTER TABLE demo_sessions ADD CONSTRAINT demo_sessions_synthetic_only CHECK (
    scenario_id LIKE 'synthetic-%'
);
