-- Phase 05 persona-configuration hardening (additive; history preserved).
--
-- Apply AFTER 002/003/004 on a sanitized clone first, resolve the audit
-- report (multi-active / no-active prompt versions), then apply live.
-- Rollback is application-level: new columns are optional and old readers
-- ignore them.

-- 1. Persona revision for snapshot staleness + refresh guards.
ALTER TABLE personas ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1;

-- 2. Single-active prompt invariant (enforced in SQL, not app memory).
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_versions_one_active
    ON prompt_versions (persona_id) WHERE is_active = TRUE;

-- 3. Participant snapshot provenance (all optional for legacy rows).
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS persona_version INT;
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS persona_revision INT NOT NULL DEFAULT 1;
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS snapshot_revision INT NOT NULL DEFAULT 1;
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS base_instruction TEXT;
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS persona_extension TEXT;
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS effective_provider JSONB;
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS stack_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Atomic prompt activation: validate target first, then switch active.
CREATE OR REPLACE FUNCTION activate_prompt_version(p_persona_id UUID, p_version INT)
RETURNS BOOLEAN AS $$
DECLARE
    v_target UUID;
BEGIN
    SELECT id INTO v_target FROM prompt_versions
     WHERE persona_id = p_persona_id AND version = p_version;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    UPDATE prompt_versions SET is_active = FALSE
     WHERE persona_id = p_persona_id AND id <> v_target AND is_active = TRUE;
    UPDATE prompt_versions SET is_active = TRUE WHERE id = v_target;
    UPDATE personas SET revision = revision + 1, updated_at = NOW()
     WHERE id = p_persona_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Audit helper: report personas whose history needs an owner decision
-- before the single-active constraint can be trusted.
CREATE OR REPLACE FUNCTION audit_prompt_versions()
RETURNS TABLE (persona_id UUID, total BIGINT, active BIGINT) AS $$
BEGIN
    RETURN QUERY SELECT p.persona_id, COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE p.is_active)::BIGINT
        FROM prompt_versions p GROUP BY p.persona_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
