-- Durable knowledge and deletion-aware evidence (spec 09).
--
-- SQL is the eligibility authority. Qdrant payloads are a derived
-- projection and can never make an unready or revoked revision eligible.
--
-- This migration is additive. Existing documents are backfilled once so
-- every document has a revision the new eligibility queries can join:
-- - 'indexed' rows become 'unavailable': their original bytes were never
--   retained, so they must be re-uploaded rather than silently trusted;
-- - 'processing'/'failed' rows become failed revisions with an honest
--   interruption message.
--
-- Long work is split into short SQL transitions (admit, claim, publish,
-- fail, revoke). No function holds a transaction across storage, parsing,
-- embedding, or vector calls.

-- --------------------------------------------------------------------------
-- 1) Revisions: source identity, embedding metadata, eligibility state.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_revisions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending', 'parsing', 'indexing', 'ready',
            'failed', 'revoked', 'unavailable'
        )),
    source_key TEXT,
    source_sha256 CHAR(64),
    source_size_bytes BIGINT,
    file_type VARCHAR(50),
    qdrant_collection VARCHAR(255),
    embedding_provider TEXT,
    embedding_model TEXT,
    embedding_dimension INTEGER,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    UNIQUE (document_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_document_revisions_document_id
    ON public.document_revisions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_revisions_eligible
    ON public.document_revisions(status, revoked_at)
    WHERE status = 'ready';
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_revisions_one_ready
    ON public.document_revisions(document_id)
    WHERE status = 'ready';

-- --------------------------------------------------------------------------
-- 2) Durable ingestion jobs: the upload receipt's operation identity.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_ingestions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    revision_id UUID NOT NULL REFERENCES public.document_revisions(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'processing', 'ready', 'failed', 'revoked')),
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (revision_id)
);

CREATE INDEX IF NOT EXISTS idx_document_ingestions_state_lease
    ON public.document_ingestions(state, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_document_ingestions_document_id
    ON public.document_ingestions(document_id);

-- --------------------------------------------------------------------------
-- 3) Chunk identity: hashes and ordinals only, never a second raw copy.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_chunks (
    id UUID PRIMARY KEY,
    revision_id UUID NOT NULL REFERENCES public.document_revisions(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content_sha256 CHAR(64) NOT NULL,
    char_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (revision_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_hash
    ON public.document_chunks(content_sha256);

-- --------------------------------------------------------------------------
-- 4) Source-linked retrieved-passage evidence (redactable raw passages).
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.retrieved_passage_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    participant_id UUID,
    operation_id UUID,
    tool_call_id TEXT,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    document_id UUID NOT NULL,
    revision_id UUID NOT NULL,
    chunk_id UUID,
    chunk_sha256 CHAR(64),
    source_name TEXT,
    raw_passage TEXT,
    score DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    redacted_at TIMESTAMPTZ,
    redaction_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_passage_evidence_revision
    ON public.retrieved_passage_evidence(revision_id);
CREATE INDEX IF NOT EXISTS idx_passage_evidence_document
    ON public.retrieved_passage_evidence(document_id);
CREATE INDEX IF NOT EXISTS idx_passage_evidence_meeting
    ON public.retrieved_passage_evidence(meeting_id);
CREATE INDEX IF NOT EXISTS idx_passage_evidence_unredacted
    ON public.retrieved_passage_evidence(revision_id)
    WHERE redacted_at IS NULL;

-- --------------------------------------------------------------------------
-- 5) Cleanup intent ledger: physical work is retryable and visible.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_cleanup (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_kind TEXT NOT NULL
        CHECK (target_kind IN (
            'source_object', 'vector_revision',
            'vector_collection', 'evidence_redaction'
        )),
    target_id UUID NOT NULL,
    document_id UUID,
    revision_id UUID,
    collection_name TEXT,
    source_key TEXT,
    reason TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    UNIQUE (target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_cleanup_unresolved
    ON public.knowledge_cleanup(created_at)
    WHERE resolved_at IS NULL;

-- --------------------------------------------------------------------------
-- 6) Append-only deletion/redaction manifest for backup reconciliation.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_deletion_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_kind TEXT NOT NULL
        CHECK (event_kind IN ('revoked', 'evidence_redacted')),
    target_id UUID NOT NULL,
    document_id UUID,
    revision_id UUID,
    source_key TEXT,
    reason TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_deletion_events_occurred
    ON public.knowledge_deletion_events(occurred_at);

-- --------------------------------------------------------------------------
-- 7) Backfill legacy documents exactly once.
-- --------------------------------------------------------------------------

INSERT INTO public.document_revisions (
    id, document_id, revision_number, status, source_size_bytes,
    file_type, qdrant_collection, error_message, created_at, revoked_at
)
SELECT
    gen_random_uuid(),
    d.id,
    1,
    CASE WHEN d.status = 'indexed' THEN 'unavailable' ELSE 'failed' END,
    d.file_size_bytes,
    d.file_type,
    d.qdrant_collection,
    CASE
        WHEN d.status = 'indexed' THEN
            'Original bytes were not retained by the legacy pipeline; re-upload this document to make it retrievable.'
        ELSE
            'Ingestion was interrupted before durable source storage existed; re-upload this document.'
    END,
    d.created_at,
    CASE WHEN d.status = 'indexed' THEN NOW() ELSE NULL END
FROM public.documents d
WHERE NOT EXISTS (
    SELECT 1 FROM public.document_revisions r
    WHERE r.document_id = d.id
);

ALTER TABLE public.documents
    DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents
    ADD CONSTRAINT documents_status_check
    CHECK (status IN (
        'pending', 'processing', 'indexed', 'ready',
        'failed', 'revoked', 'unavailable'
    ));

UPDATE public.documents
SET status = 'unavailable',
    error_message = 'Original bytes were not retained by the legacy pipeline; re-upload this document to make it retrievable.'
WHERE status = 'indexed';

UPDATE public.documents
SET status = 'failed',
    error_message = 'Ingestion was interrupted before durable source storage existed; re-upload this document.'
WHERE status = 'processing';

-- --------------------------------------------------------------------------
-- 8) Admission: bytes are already durable; commit document+revision+job.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_admit_upload(
    p_document_id UUID,
    p_revision_id UUID,
    p_ingestion_id UUID,
    p_meeting_id UUID,
    p_persona_id UUID,
    p_stack_id UUID,
    p_file_name TEXT,
    p_file_type TEXT,
    p_file_size_bytes BIGINT,
    p_collection_name TEXT,
    p_source_key TEXT,
    p_source_sha256 TEXT,
    p_embedding_provider TEXT,
    p_embedding_model TEXT,
    p_embedding_dimension INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_owner_count INTEGER;
    v_existing public.document_ingestions;
BEGIN
    SELECT * INTO v_existing
    FROM public.document_ingestions
    WHERE id = p_ingestion_id;

    IF FOUND THEN
        IF v_existing.document_id <> p_document_id
           OR v_existing.revision_id <> p_revision_id THEN
            RAISE EXCEPTION 'ingestion receipt identity conflict';
        END IF;
        RETURN jsonb_build_object(
            'outcome', 'existing',
            'document_id', v_existing.document_id,
            'revision_id', v_existing.revision_id,
            'ingestion_id', v_existing.id,
            'state', v_existing.state
        );
    END IF;

    v_owner_count :=
        (CASE WHEN p_meeting_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p_persona_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN p_stack_id IS NOT NULL THEN 1 ELSE 0 END);

    IF v_owner_count <> 1 THEN
        RAISE EXCEPTION 'exactly one knowledge owner is required';
    END IF;
    IF p_file_size_bytes IS NULL OR p_file_size_bytes <= 0 THEN
        RAISE EXCEPTION 'file size must be positive';
    END IF;
    IF p_file_size_bytes > 52428800 THEN
        RAISE EXCEPTION 'file exceeds the 50 MiB source budget';
    END IF;
    IF p_source_sha256 IS NULL OR length(p_source_sha256) <> 64 THEN
        RAISE EXCEPTION 'source sha256 must be 64 hex characters';
    END IF;
    IF p_source_key IS NULL OR length(p_source_key) = 0 THEN
        RAISE EXCEPTION 'source key is required';
    END IF;
    IF p_collection_name IS NULL OR length(p_collection_name) = 0 THEN
        RAISE EXCEPTION 'collection name is required';
    END IF;

    INSERT INTO public.documents (
        id, meeting_id, persona_id, stack_id,
        file_name, file_type, file_size_bytes,
        chunk_count, qdrant_collection, status
    ) VALUES (
        p_document_id, p_meeting_id, p_persona_id, p_stack_id,
        p_file_name, p_file_type, p_file_size_bytes,
        0, p_collection_name, 'processing'
    );

    INSERT INTO public.document_revisions (
        id, document_id, revision_number, status,
        source_key, source_sha256, source_size_bytes, file_type,
        qdrant_collection, embedding_provider, embedding_model,
        embedding_dimension
    ) VALUES (
        p_revision_id, p_document_id, 1, 'pending',
        p_source_key, p_source_sha256, p_file_size_bytes, p_file_type,
        p_collection_name, p_embedding_provider, p_embedding_model,
        p_embedding_dimension
    );

    INSERT INTO public.document_ingestions (
        id, document_id, revision_id, state
    ) VALUES (
        p_ingestion_id, p_document_id, p_revision_id, 'pending'
    );

    RETURN jsonb_build_object(
        'outcome', 'admitted',
        'document_id', p_document_id,
        'revision_id', p_revision_id,
        'ingestion_id', p_ingestion_id,
        'state', 'pending'
    );
END $$;

-- --------------------------------------------------------------------------
-- 9) Claim: short lease, revision enters parsing, revoked work refuses.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_claim_ingestion(
    p_ingestion_id UUID,
    p_lease_owner TEXT,
    p_now TIMESTAMPTZ,
    p_lease_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_job public.document_ingestions;
    v_revision public.document_revisions;
    v_document public.documents;
BEGIN
    SELECT * INTO v_job
    FROM public.document_ingestions
    WHERE id = p_ingestion_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    SELECT * INTO v_revision
    FROM public.document_revisions
    WHERE id = v_job.revision_id
    FOR UPDATE;

    SELECT * INTO v_document
    FROM public.documents
    WHERE id = v_job.document_id;

    IF v_revision.revoked_at IS NOT NULL OR v_revision.status = 'revoked' THEN
        UPDATE public.document_ingestions
        SET state = 'revoked', updated_at = p_now
        WHERE id = p_ingestion_id AND state <> 'revoked';
        RETURN jsonb_build_object('outcome', 'revoked');
    END IF;

    IF v_job.state = 'ready' THEN
        RETURN jsonb_build_object('outcome', 'ready');
    END IF;

    IF v_job.state = 'processing'
       AND v_job.lease_expires_at IS NOT NULL
       AND v_job.lease_expires_at > p_now THEN
        RETURN jsonb_build_object('outcome', 'busy');
    END IF;

    UPDATE public.document_ingestions
    SET state = 'processing',
        attempts = attempts + 1,
        lease_owner = p_lease_owner,
        lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        last_error = NULL,
        updated_at = p_now
    WHERE id = p_ingestion_id;

    UPDATE public.document_revisions
    SET status = 'parsing', updated_at = p_now, error_message = NULL
    WHERE id = v_job.revision_id
      AND revoked_at IS NULL
      AND status <> 'ready';

    UPDATE public.documents
    SET status = 'processing', error_message = NULL
    WHERE id = v_job.document_id
      AND status <> 'revoked';

    RETURN jsonb_build_object(
        'outcome', 'claimed',
        'document_id', v_job.document_id,
        'revision_id', v_job.revision_id,
        'file_name', v_document.file_name,
        'file_type', v_revision.file_type,
        'source_key', v_revision.source_key,
        'source_sha256', v_revision.source_sha256,
        'source_size_bytes', v_revision.source_size_bytes,
        'collection_name', v_revision.qdrant_collection,
        'embedding_provider', v_revision.embedding_provider,
        'embedding_model', v_revision.embedding_model,
        'embedding_dimension', v_revision.embedding_dimension,
        'attempts', v_job.attempts + 1
    );
END $$;

-- --------------------------------------------------------------------------
-- 10) Parse complete; begin vector publication (stale work refuses).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_start_indexing(
    p_ingestion_id UUID,
    p_revision_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.document_revisions
    SET status = 'indexing', updated_at = NOW()
    WHERE id = p_revision_id
      AND status IN ('pending', 'parsing', 'failed')
      AND revoked_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.document_ingestions
    SET state = 'processing', updated_at = NOW()
    WHERE id = p_ingestion_id AND state <> 'revoked';

    RETURN TRUE;
END $$;

-- --------------------------------------------------------------------------
-- 11) Publish: chunks + ready happen in one conditional commit.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_publish_revision(
    p_ingestion_id UUID,
    p_revision_id UUID,
    p_chunk_count INTEGER,
    p_chunks JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_revision public.document_revisions;
BEGIN
    SELECT * INTO v_revision
    FROM public.document_revisions
    WHERE id = p_revision_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;
    IF v_revision.revoked_at IS NOT NULL OR v_revision.status = 'revoked' THEN
        RETURN jsonb_build_object('outcome', 'revoked');
    END IF;

    INSERT INTO public.document_chunks (
        id, revision_id, chunk_index, content_sha256, char_count
    )
    SELECT
        (item->>'id')::UUID,
        p_revision_id,
        (item->>'chunk_index')::INTEGER,
        item->>'content_sha256',
        (item->>'char_count')::INTEGER
    FROM jsonb_array_elements(COALESCE(p_chunks, '[]'::JSONB)) AS item
    ON CONFLICT (revision_id, chunk_index) DO UPDATE
    SET content_sha256 = EXCLUDED.content_sha256,
        char_count = EXCLUDED.char_count;

    UPDATE public.document_revisions
    SET status = 'ready',
        chunk_count = p_chunk_count,
        published_at = NOW(),
        updated_at = NOW(),
        error_message = NULL
    WHERE id = p_revision_id AND revoked_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'revoked');
    END IF;

    UPDATE public.document_ingestions
    SET state = 'ready',
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_ingestion_id AND state <> 'revoked';

    UPDATE public.documents
    SET status = 'ready',
        chunk_count = p_chunk_count,
        error_message = NULL
    WHERE id = v_revision.document_id AND status <> 'revoked';

    RETURN jsonb_build_object(
        'outcome', 'ready',
        'document_id', v_revision.document_id,
        'revision_id', p_revision_id
    );
END $$;

-- --------------------------------------------------------------------------
-- 12) Failure: honest, retryable, never overrides a revocation.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_fail_ingestion(
    p_ingestion_id UUID,
    p_revision_id UUID,
    p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_revision public.document_revisions;
BEGIN
    SELECT * INTO v_revision
    FROM public.document_revisions
    WHERE id = p_revision_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF v_revision.revoked_at IS NOT NULL OR v_revision.status = 'revoked' THEN
        RETURN FALSE;
    END IF;

    UPDATE public.document_revisions
    SET status = 'failed',
        error_message = p_error,
        updated_at = NOW()
    WHERE id = p_revision_id AND status <> 'ready' AND revoked_at IS NULL;

    UPDATE public.document_ingestions
    SET state = 'failed',
        lease_owner = NULL,
        lease_expires_at = NULL,
        last_error = p_error,
        updated_at = NOW()
    WHERE id = p_ingestion_id AND state <> 'revoked';

    UPDATE public.documents
    SET status = 'failed', error_message = p_error
    WHERE id = v_revision.document_id AND status <> 'revoked';

    RETURN TRUE;
END $$;

-- --------------------------------------------------------------------------
-- 13) Revocation: exclude immediately, persist every cleanup intent.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_revoke_document(
    p_document_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_revision public.document_revisions;
    v_count INTEGER := 0;
BEGIN
    UPDATE public.documents
    SET status = 'revoked', error_message = p_reason
    WHERE id = p_document_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'not_found');
    END IF;

    FOR v_revision IN
        SELECT * FROM public.document_revisions
        WHERE document_id = p_document_id
    LOOP
        UPDATE public.document_revisions
        SET status = 'revoked',
            revoked_at = COALESCE(revoked_at, NOW()),
            updated_at = NOW(),
            error_message = p_reason
        WHERE id = v_revision.id;

        UPDATE public.document_ingestions
        SET state = 'revoked',
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = NOW()
        WHERE revision_id = v_revision.id AND state <> 'revoked';

        IF v_revision.source_key IS NOT NULL THEN
            INSERT INTO public.knowledge_cleanup (
                target_kind, target_id, document_id, revision_id,
                source_key, reason
            ) VALUES (
                'source_object', v_revision.id, p_document_id, v_revision.id,
                v_revision.source_key, p_reason
            )
            ON CONFLICT (target_kind, target_id) DO NOTHING;
        END IF;

        IF v_revision.qdrant_collection IS NOT NULL THEN
            INSERT INTO public.knowledge_cleanup (
                target_kind, target_id, document_id, revision_id,
                collection_name, reason
            ) VALUES (
                'vector_revision', v_revision.id, p_document_id, v_revision.id,
                v_revision.qdrant_collection, p_reason
            )
            ON CONFLICT (target_kind, target_id) DO NOTHING;
        END IF;

        INSERT INTO public.knowledge_cleanup (
            target_kind, target_id, document_id, revision_id, reason
        ) VALUES (
            'evidence_redaction', v_revision.id, p_document_id, v_revision.id,
            p_reason
        )
        ON CONFLICT (target_kind, target_id) DO NOTHING;

        INSERT INTO public.knowledge_deletion_events (
            event_kind, target_id, document_id, revision_id, source_key, reason
        ) VALUES (
            'revoked', v_revision.id, p_document_id, v_revision.id,
            v_revision.source_key, p_reason
        )
        ON CONFLICT (event_kind, target_id) DO NOTHING;

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'outcome', 'revoked',
        'document_id', p_document_id,
        'revisions', v_count
    );
END $$;

-- --------------------------------------------------------------------------
-- 14) Eligible revisions: meeting-shared + participant-assigned stacks.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_eligible_revisions(
    p_meeting_id UUID,
    p_stack_ids UUID[]
)
RETURNS TABLE (
    document_id UUID,
    revision_id UUID,
    qdrant_collection TEXT,
    file_name TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        d.id,
        r.id,
        r.qdrant_collection,
        d.file_name
    FROM public.documents d
    JOIN public.document_revisions r ON r.document_id = d.id
    WHERE r.status = 'ready'
      AND r.revoked_at IS NULL
      AND (
          (p_meeting_id IS NOT NULL AND d.meeting_id = p_meeting_id)
          OR (d.stack_id = ANY (COALESCE(p_stack_ids, '{}'::UUID[])))
      );
$$;

CREATE OR REPLACE FUNCTION public.knowledge_revalidate_revisions(
    p_revision_ids UUID[],
    p_meeting_id UUID,
    p_stack_ids UUID[]
)
RETURNS TABLE (
    document_id UUID,
    revision_id UUID,
    qdrant_collection TEXT,
    file_name TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT *
    FROM public.knowledge_eligible_revisions(p_meeting_id, p_stack_ids) e
    WHERE e.revision_id = ANY (COALESCE(p_revision_ids, '{}'::UUID[]));
$$;

-- --------------------------------------------------------------------------
-- 15) Evidence redaction: raw passages only; conversation text is untouched.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_redact_evidence(
    p_revision_id UUID,
    p_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.retrieved_passage_evidence
    SET raw_passage = NULL,
        redacted_at = COALESCE(redacted_at, NOW()),
        redaction_reason = p_reason
    WHERE revision_id = p_revision_id
      AND redacted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO public.knowledge_deletion_events (
        event_kind, target_id, revision_id, reason
    ) VALUES (
        'evidence_redacted', p_revision_id, p_revision_id, p_reason
    )
    ON CONFLICT (event_kind, target_id) DO NOTHING;

    RETURN v_count;
END $$;

-- --------------------------------------------------------------------------
-- 16) Parent cleanup: revoke every owned document before cascade deletes.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_revoke_parent(
    p_parent_kind TEXT,
    p_parent_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_document UUID;
    v_count INTEGER := 0;
    v_result JSONB;
BEGIN
    IF p_parent_kind NOT IN ('meeting', 'stack', 'persona') THEN
        RAISE EXCEPTION 'unsupported knowledge parent %', p_parent_kind;
    END IF;

    FOR v_document IN
        SELECT id FROM public.documents
        WHERE (p_parent_kind = 'meeting' AND meeting_id = p_parent_id)
           OR (p_parent_kind = 'stack' AND stack_id = p_parent_id)
           OR (p_parent_kind = 'persona' AND persona_id = p_parent_id)
    LOOP
        v_result := public.knowledge_revoke_document(v_document, p_reason);
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('outcome', 'revoked', 'documents', v_count);
END $$;

-- --------------------------------------------------------------------------
-- 17) Restore reconciliation: replay deletion/redaction intent after backup.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.knowledge_replay_deletion_events(
    p_since TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_event public.knowledge_deletion_events;
    v_revoked INTEGER := 0;
    v_redacted INTEGER := 0;
BEGIN
    FOR v_event IN
        SELECT * FROM public.knowledge_deletion_events
        WHERE occurred_at > p_since
        ORDER BY occurred_at
    LOOP
        IF v_event.event_kind = 'revoked' THEN
            UPDATE public.document_revisions
            SET status = 'revoked',
                revoked_at = COALESCE(revoked_at, v_event.occurred_at),
                updated_at = NOW()
            WHERE id = v_event.revision_id;
            UPDATE public.documents
            SET status = 'revoked'
            WHERE id = v_event.document_id;
            UPDATE public.document_ingestions
            SET state = 'revoked', updated_at = NOW()
            WHERE revision_id = v_event.revision_id;
            INSERT INTO public.knowledge_cleanup (
                target_kind, target_id, document_id, revision_id,
                source_key, collection_name, reason
            )
            SELECT
                'source_object', r.id, r.document_id, r.id,
                r.source_key, NULL, v_event.reason
            FROM public.document_revisions r
            WHERE r.id = v_event.revision_id AND r.source_key IS NOT NULL
            ON CONFLICT (target_kind, target_id) DO NOTHING;
            INSERT INTO public.knowledge_cleanup (
                target_kind, target_id, document_id, revision_id,
                source_key, collection_name, reason
            )
            SELECT
                'vector_revision', r.id, r.document_id, r.id,
                NULL, r.qdrant_collection, v_event.reason
            FROM public.document_revisions r
            WHERE r.id = v_event.revision_id AND r.qdrant_collection IS NOT NULL
            ON CONFLICT (target_kind, target_id) DO NOTHING;
            INSERT INTO public.knowledge_cleanup (
                target_kind, target_id, document_id, revision_id, reason
            ) VALUES (
                'evidence_redaction', v_event.revision_id,
                v_event.document_id, v_event.revision_id, v_event.reason
            )
            ON CONFLICT (target_kind, target_id) DO NOTHING;
            v_revoked := v_revoked + 1;
        ELSIF v_event.event_kind = 'evidence_redacted' THEN
            UPDATE public.retrieved_passage_evidence
            SET raw_passage = NULL,
                redacted_at = COALESCE(redacted_at, v_event.occurred_at),
                redaction_reason = v_event.reason
            WHERE revision_id = v_event.revision_id;
            v_redacted := v_redacted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'revoked_events', v_revoked,
        'redacted_events', v_redacted
    );
END $$;

-- --------------------------------------------------------------------------
-- 18) Internal tables: no anonymous access. Service role performs writes.
-- --------------------------------------------------------------------------

ALTER TABLE public.document_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrieved_passage_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_cleanup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_deletion_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    EXECUTE 'REVOKE ALL ON public.document_revisions FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.document_ingestions FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.document_chunks FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.retrieved_passage_evidence FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.knowledge_cleanup FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.knowledge_deletion_events FROM PUBLIC';
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.document_revisions FROM anon';
        EXECUTE 'REVOKE ALL ON public.document_ingestions FROM anon';
        EXECUTE 'REVOKE ALL ON public.document_chunks FROM anon';
        EXECUTE 'REVOKE ALL ON public.retrieved_passage_evidence FROM anon';
        EXECUTE 'REVOKE ALL ON public.knowledge_cleanup FROM anon';
        EXECUTE 'REVOKE ALL ON public.knowledge_deletion_events FROM anon';
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.document_revisions FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.document_ingestions FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.document_chunks FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.retrieved_passage_evidence FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.knowledge_cleanup FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.knowledge_deletion_events FROM authenticated';
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 19) Function grants mirror the operations primitive.
-- --------------------------------------------------------------------------

DO $$
DECLARE
    target TEXT[] := ARRAY[
        'knowledge_admit_upload',
        'knowledge_claim_ingestion',
        'knowledge_start_indexing',
        'knowledge_publish_revision',
        'knowledge_fail_ingestion',
        'knowledge_revoke_document',
        'knowledge_eligible_revisions',
        'knowledge_revalidate_revisions',
        'knowledge_redact_evidence',
        'knowledge_revoke_parent',
        'knowledge_replay_deletion_events'
    ];
    seq RECORD;
BEGIN
    FOR seq IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY (target)
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',
            seq.proname, seq.args
        );
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.%I(%s) FROM anon',
                seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format(
                'REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated',
                seq.proname, seq.args
            );
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                seq.proname, seq.args
            );
        END IF;
    END LOOP;
END $$;
