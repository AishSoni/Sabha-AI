/**
 * Pure knowledge view contracts (spec-23).
 *
 * These shapes let the live and demo adapters render the same presentation
 * without importing a client, hook, transport, or store.
 */

export type KnowledgeDocumentStatus =
    | "pending"
    | "processing"
    | "ready"
    | "failed"
    | "revoked"
    | "unavailable";

export interface KnowledgeDocumentView {
    id: string;
    file_name: string;
    file_type: string;
    file_size_bytes: number;
    status: string;
    chunk_count: number;
    operation_id?: string | null;
    error_message?: string | null;
}

export interface KnowledgeUploadReceiptView {
    operationId?: string;
    fileName: string;
    state: "pending" | "ready" | "failed" | "revoked";
}

export interface IngestionProgressView {
    state: string;
    documentId?: string | null;
    documentStatus?: string | null;
    chunkCount: number;
    errorMessage?: string | null;
    fileName?: string | null;
}

export interface KnowledgeStackView {
    id: string;
    name: string;
    description?: string | null;
    /** Practice adapters expose real counts; the live list leaves them unset. */
    documentCount?: number;
    readyCount?: number;
    assignedParticipantNames?: string[];
    scope?: "shared" | "private";
}

export interface KnowledgeHrefs {
    createStack: string;
    stack: (stackId: string) => string;
}
