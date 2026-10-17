-- Demo Bond Package Migration (Phase 10, Part B)
-- Compatible additive migration: stores the immutable versioned journey
-- package (DB-backed seed) separately from mutable session progress.
-- Existing rows preserved; no data deleted. Rerunnable via IF NOT EXISTS.
--
-- Package row holds the full authoring artifact as JSONB plus pinned
-- identity columns for lookup. Import is idempotent on
-- (scenario_id, content_version, scenario_revision).

CREATE TABLE IF NOT EXISTS demo_bond_packages (
    scenario_id TEXT NOT NULL,
    content_version INT NOT NULL,
    scenario_revision INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'superseded')),
    package JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scenario_id, content_version, scenario_revision)
);

CREATE INDEX IF NOT EXISTS idx_demo_bond_packages_status
    ON demo_bond_packages(status);
