-- PDF extraction provenance and page locators (spec 16).
--
-- Extraction metadata describes how text was obtained; it is not a source
-- assertion. Page numbers are 1-based locators for accepted extracted text
-- and remain nullable for non-paginated formats and legacy chunks.
--
-- Publication stays one conditional commit. The replaced function keeps the
-- existing stale/revoked checks and adds the extraction provenance and page
-- locator to the accepted revision.

-- --------------------------------------------------------------------------
-- 1) Revision extraction provenance (nullable so existing rows stay honest).
-- --------------------------------------------------------------------------

ALTER TABLE public.document_revisions
    ADD COLUMN IF NOT EXISTS extraction_method TEXT,
    ADD COLUMN IF NOT EXISTS extraction_version TEXT,
    ADD COLUMN IF NOT EXISTS page_count INTEGER,
    ADD COLUMN IF NOT EXISTS ocr_page_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.document_revisions
    DROP CONSTRAINT IF EXISTS document_revisions_page_count_check;
ALTER TABLE public.document_revisions
    ADD CONSTRAINT document_revisions_page_count_check
    CHECK (page_count IS NULL OR page_count > 0);

ALTER TABLE public.document_revisions
    DROP CONSTRAINT IF EXISTS document_revisions_ocr_page_count_check;
ALTER TABLE public.document_revisions
    ADD CONSTRAINT document_revisions_ocr_page_count_check
    CHECK (ocr_page_count >= 0);

-- --------------------------------------------------------------------------
-- 2) Chunk page locators. Page numbers are extraction locators, not claims.
-- --------------------------------------------------------------------------

ALTER TABLE public.document_chunks
    ADD COLUMN IF NOT EXISTS page_number INTEGER;

ALTER TABLE public.document_chunks
    DROP CONSTRAINT IF EXISTS document_chunks_page_number_check;
ALTER TABLE public.document_chunks
    ADD CONSTRAINT document_chunks_page_number_check
    CHECK (page_number IS NULL OR page_number > 0);

-- --------------------------------------------------------------------------
-- 3) Replace publication with extraction metadata and page locators.
-- --------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.knowledge_publish_revision(
    UUID, UUID, INTEGER, JSONB
);

CREATE OR REPLACE FUNCTION public.knowledge_publish_revision(
    p_ingestion_id UUID,
    p_revision_id UUID,
    p_chunk_count INTEGER,
    p_chunks JSONB,
    p_extraction_method TEXT,
    p_extraction_version TEXT,
    p_page_count INTEGER,
    p_ocr_page_count INTEGER
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
        id, revision_id, chunk_index, content_sha256, char_count, page_number
    )
    SELECT
        (item->>'id')::UUID,
        p_revision_id,
        (item->>'chunk_index')::INTEGER,
        item->>'content_sha256',
        (item->>'char_count')::INTEGER,
        CASE
            WHEN item->>'page_number' IS NULL THEN NULL
            ELSE (item->>'page_number')::INTEGER
        END
    FROM jsonb_array_elements(COALESCE(p_chunks, '[]'::JSONB)) AS item
    ON CONFLICT (revision_id, chunk_index) DO UPDATE
    SET content_sha256 = EXCLUDED.content_sha256,
        char_count = EXCLUDED.char_count,
        page_number = EXCLUDED.page_number;

    UPDATE public.document_revisions
    SET status = 'ready',
        chunk_count = p_chunk_count,
        extraction_method = p_extraction_method,
        extraction_version = p_extraction_version,
        page_count = p_page_count,
        ocr_page_count = COALESCE(p_ocr_page_count, 0),
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

-- 030 revoked PUBLIC/anon/authenticated access and granted service_role by
-- default. Grant the replaced function explicitly rather than relying on
-- default privileges that may have been changed on a hosted project.
DO $$
BEGIN
    REVOKE ALL ON FUNCTION public.knowledge_publish_revision(
        UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER, INTEGER
    ) FROM PUBLIC;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.knowledge_publish_revision(
            UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER, INTEGER
        ) FROM anon;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON FUNCTION public.knowledge_publish_revision(
            UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER, INTEGER
        ) FROM authenticated;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.knowledge_publish_revision(
            UUID, UUID, INTEGER, JSONB, TEXT, TEXT, INTEGER, INTEGER
        ) TO service_role;
    END IF;
END $$;

COMMENT ON COLUMN public.document_revisions.extraction_method IS
    'Bounded extractor used for accepted text (for example pypdf+ocr); null when unknown.';
COMMENT ON COLUMN public.document_revisions.extraction_version IS
    'Version of the extraction contract; not a document claim review.';
COMMENT ON COLUMN public.document_revisions.page_count IS
    'Source page count when the format is paginated; null when unknown.';
COMMENT ON COLUMN public.document_revisions.ocr_page_count IS
    'Number of pages that used the bounded OCR fallback.';
COMMENT ON COLUMN public.document_chunks.page_number IS
    '1-based source page locator for extracted text; null for non-paginated formats.';
