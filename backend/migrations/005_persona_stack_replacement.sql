-- Atomic persona knowledge-stack assignment replacement
-- PersonaManager.update_persona() swapped assignments with two separate
-- statements (DELETE all, then INSERT new) over the API. A crash between
-- them left a persona with no stacks. This function performs validation of
-- every referenced stack, delete and re-insert inside one implicit Postgres
-- transaction so a failed replacement leaves prior assignments intact.

CREATE OR REPLACE FUNCTION replace_persona_stacks(
    p_persona_id UUID,
    p_stack_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    unknown_ids UUID[];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM personas WHERE id = p_persona_id) THEN
        RAISE EXCEPTION 'persona_not_found';
    END IF;

    -- Defensive re-validation inside the transaction (the API validates as
    -- well, before calling): unknown stack ids abort with nothing changed.
    SELECT COALESCE(array_agg(sid), ARRAY[]::uuid[]) INTO unknown_ids
    FROM UNNEST(p_stack_ids) AS sid
    WHERE sid NOT IN (SELECT id FROM knowledge_stacks);

    IF array_length(unknown_ids, 1) > 0 THEN
        RAISE EXCEPTION 'unknown_knowledge_stacks' USING ERRCODE = '23503';
    END IF;

    DELETE FROM persona_knowledge_stacks
    WHERE persona_id = p_persona_id;

    INSERT INTO persona_knowledge_stacks (persona_id, stack_id)
    SELECT DISTINCT p_persona_id, sid
    FROM UNNEST(p_stack_ids) AS sid;
END;
$$;
