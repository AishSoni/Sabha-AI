-- Phase 06 knowledge durability (additive; safe to re-run).
--
-- Survives API restarts: ingestion jobs and vector cleanup survive as rows.
-- Tombstone-first deletion keeps identifiers so workers can finish cleanup.

-- Documents: durability + tombstone columns.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_object_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ingestion_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cleanup_pending BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_cleanup_pending ON documents(cleanup_pending)
    WHERE cleanup_pending = TRUE;

-- Durable ingestion jobs: one replayable row per document.
CREATE TABLE IF NOT EXISTS document_ingestion_jobs (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    collection_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    storage_object_path TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT 'queued'
        CHECK (state IN ('queued', 'processing', 'indexed', 'failed')),
    attempts INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_state ON document_ingestion_jobs(state);

-- Durable vector cleanup outbox: tombstone-first deletion leaves work here.
CREATE TABLE IF NOT EXISTS vector_cleanup_outbox (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    collection_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    done BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cleanup_outbox_pending ON vector_cleanup_outbox(done)
    WHERE done = FALSE;
