/**
 * Wire decoders for the Knowledge feature.
 *
 * Shapes mirror the frozen backend contract snapshot
 * (frontend/tests/fixtures/openapi.json -> components.schemas.*). The
 * generated types stay the source of truth and these decoders give the
 * runtime breadcrumb-checked validation the generated types cannot.
 */
import {
    decodeObject,
    optionalNumber,
    optionalString,
    requireArray,
    requireNumber,
    requireString,
} from '@/shared/api/decode';
import type { components } from '@/shared/api/generated';

export type DocumentUploadResponse = components['schemas']['UploadReceiptResponse'];
export type IngestionStatus = components['schemas']['IngestionStatusResponse'];
export type DocumentRecord = components['schemas']['DocumentResponse'];

/**
 * Upload acknowledgement. Only ``state === 'ready'`` means the document is
 * eligible for retrieval; a pending receipt carries the durable operation id
 * the caller observes instead of re-uploading bytes.
 */
export interface UploadReceipt {
    state: 'pending' | 'ready';
    documentId: string;
    operationId: string | null;
    revisionId: string | null;
    file_name: string;
    status: string;
    chunk_count: number;
    message: string;
}

export interface Document {
    id: string;
    file_name: string;
    file_type: string;
    file_size_bytes: number;
    chunk_count: number;
    qdrant_collection: string | null;
    status: string;
    error_message: string | null;
    created_at: string | null;
    meeting_id: string | null;
    persona_id: string | null;
    stack_id: string | null;
    revision_id: string | null;
    revision_state: string | null;
    operation_id: string | null;
}

export interface IngestionProgress {
    operationId: string;
    documentId: string;
    revisionId: string;
    state: string;
    revisionState: string;
    documentStatus: string;
    fileName: string;
    fileType: string;
    chunkCount: number;
    errorMessage: string | null;
}

export function decodeUploadReceipt(value: unknown, path: string): UploadReceipt {
    const record = decodeObject(value, path);
    const state = requireString(record.state, `${path}.state`);
    if (state !== 'pending' && state !== 'ready') {
        throw new Error(`${path}.state: expected 'pending' or 'ready'`);
    }
    const documentId = requireString(record.documentId, `${path}.documentId`);
    const operationId = optionalString(record.operationId, `${path}.operationId`) ?? null;
    const revisionId = optionalString(record.revisionId, `${path}.revisionId`) ?? null;
    if (state === 'pending' && !operationId) {
        throw new Error(`${path}.operationId: a pending receipt needs a durable operation id`);
    }
    if (state === 'ready' && !revisionId) {
        throw new Error(`${path}.revisionId: a ready receipt needs a published revision`);
    }
    return {
        state,
        documentId,
        operationId,
        revisionId,
        file_name: requireString(record.file_name, `${path}.file_name`),
        status: requireString(record.status, `${path}.status`),
        chunk_count: requireNumber(record.chunk_count, `${path}.chunk_count`),
        message: requireString(record.message, `${path}.message`),
    };
}

export function decodeIngestionProgress(value: unknown, path: string): IngestionProgress {
    const record = decodeObject(value, path);
    return {
        operationId: requireString(record.operationId, `${path}.operationId`),
        documentId: requireString(record.documentId, `${path}.documentId`),
        revisionId: requireString(record.revisionId, `${path}.revisionId`),
        state: requireString(record.state, `${path}.state`),
        revisionState: requireString(record.revisionState, `${path}.revisionState`),
        documentStatus: requireString(record.documentStatus, `${path}.documentStatus`),
        fileName: requireString(record.fileName, `${path}.fileName`),
        fileType: requireString(record.fileType, `${path}.fileType`),
        chunkCount: requireNumber(record.chunkCount, `${path}.chunkCount`),
        errorMessage: optionalString(record.errorMessage, `${path}.errorMessage`) ?? null,
    };
}

export function decodeDocument(value: unknown, path: string): Document {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        file_name: requireString(record.file_name, `${path}.file_name`),
        file_type: requireString(record.file_type, `${path}.file_type`),
        file_size_bytes: requireNumber(record.file_size_bytes, `${path}.file_size_bytes`),
        chunk_count: requireNumber(record.chunk_count, `${path}.chunk_count`),
        qdrant_collection: optionalString(record.qdrant_collection, `${path}.qdrant_collection`) ?? null,
        status: requireString(record.status, `${path}.status`),
        error_message: optionalString(record.error_message, `${path}.error_message`) ?? null,
        created_at: optionalString(record.created_at, `${path}.created_at`) ?? null,
        meeting_id: optionalString(record.meeting_id, `${path}.meeting_id`) ?? null,
        persona_id: optionalString(record.persona_id, `${path}.persona_id`) ?? null,
        stack_id: optionalString(record.stack_id, `${path}.stack_id`) ?? null,
        revision_id: optionalString(record.revision_id, `${path}.revision_id`) ?? null,
        revision_state: optionalString(record.revision_state, `${path}.revision_state`) ?? null,
        operation_id: optionalString(record.operation_id, `${path}.operation_id`) ?? null,
    };
}

export function decodeDocumentList(value: unknown, path: string): Document[] {
    return requireArray(value, path, (item, childPath) => decodeDocument(item, childPath));
}

export function decodeOptionalNumber(value: unknown, path: string): number | null {
    return optionalNumber(value, path) ?? null;
}
