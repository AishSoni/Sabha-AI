-- Demo Bond Scenario Migration (Phase 10)
-- Run this in Supabase SQL Editor after 007.
--
-- Expands the storage guard so the single approved real scenario can persist
-- alongside synthetic fixtures, and adds the scenario-progress table that pins
-- each (session, generation) to one meeting and ordered J-steps.
-- Existing synthetic rows are preserved; no data is deleted.

-- ============================================
-- WIDEN SCENARIO GUARD (compatible expansion)
-- ============================================
ALTER TABLE demo_sessions DROP CONSTRAINT IF EXISTS demo_sessions_synthetic_only;
ALTER TABLE demo_sessions ADD CONSTRAINT demo_sessions_synthetic_only CHECK (
    scenario_id LIKE 'synthetic-%'
    OR scenario_id = 'indian-corporate-bond-review'
);

-- ============================================
-- SCENARIO PROGRESS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS demo_scenario_progress (
    session_id TEXT NOT NULL,
    generation INT NOT NULL DEFAULT 1,
    scenario_id TEXT NOT NULL DEFAULT 'indian-corporate-bond-review',
    scenario_revision INT NOT NULL DEFAULT 1,
    meeting_id TEXT,
    current_step TEXT NOT NULL DEFAULT 'start_walkthrough',
    completed_steps JSONB NOT NULL DEFAULT '[]',
    idempotency_keys JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (session_id, generation)
);

CREATE INDEX IF NOT EXISTS idx_demo_scenario_progress_meeting
    ON demo_scenario_progress(meeting_id);
