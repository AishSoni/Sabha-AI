-- Prompt version activation: enforce exactly one active prompt per persona.
--
-- Fresh databases install the invariant immediately; pre-existing databases
-- run the same statements to repair legacy data before enforcement begins.
-- Repair keeps the highest active version per persona.

-- Repair legacy duplicates (idempotent; no-op once the invariant holds).
WITH keep AS (
    SELECT DISTINCT ON (persona_id) id
    FROM prompt_versions
    WHERE is_active
    ORDER BY persona_id, version DESC, created_at DESC
)
UPDATE prompt_versions AS pv
SET is_active = FALSE
WHERE pv.is_active
  AND NOT EXISTS (SELECT 1 FROM keep k WHERE k.id = pv.id);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_versions_single_active
    ON prompt_versions (persona_id) WHERE is_active;

-- Activate a version atomically in a single UPDATE (satisfies the unique
-- partial index within one statement). Unknown versions change nothing.
CREATE OR REPLACE FUNCTION activate_prompt_version(p_persona_id UUID, p_version INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM prompt_versions
        WHERE persona_id = p_persona_id AND version = p_version
    ) THEN
        RETURN FALSE;
    END IF;

    UPDATE prompt_versions
    SET is_active = (version = p_version)
    WHERE persona_id = p_persona_id;

    UPDATE personas SET updated_at = now() WHERE id = p_persona_id;
    RETURN TRUE;
END;
$$;

-- Create a revision, flip activation, bump persona timestamps all inside one
-- transaction: any failure (invalid content, collisions, ...) rolls the whole
-- activation back, so the previous selection survives untouched.
CREATE OR REPLACE FUNCTION create_prompt_version(
    p_persona_id UUID,
    p_content TEXT,
    p_version_id UUID,
    p_created_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_version INT;
    v_row prompt_versions;
BEGIN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM prompt_versions
    WHERE persona_id = p_persona_id;

    UPDATE prompt_versions
    SET is_active = FALSE
    WHERE persona_id = p_persona_id AND is_active;

    INSERT INTO prompt_versions (id, persona_id, version, content, is_active, created_at)
    VALUES (p_version_id, p_persona_id, v_version, p_content, TRUE, p_created_at)
    RETURNING * INTO v_row;

    UPDATE personas SET updated_at = now() WHERE id = p_persona_id;

    RETURN to_jsonb(v_row);
END;
$$;
