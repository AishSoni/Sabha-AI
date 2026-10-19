/**
 * Wire decoders for document records (spec-05).
 *
 * Shapes mirror the frozen backend contract snapshot
 * (frontend/tests/fixtures/openapi.json -> components.schemas.*) — the
 * generated types stay the source of truth and these decoders give the
 * runtime breadcrumb-checked validation the generated types cannot.
 */
import { decodeObject, requireNumber, requireString } from '@/shared/api/decode';
import type { components } from '@/shared/api/generated';

export type DocumentUploadResponse = components['schemas']['DocumentUploadResponse'];

export function decodeDocumentUploadResponse(
    value: unknown,
    path: string
): DocumentUploadResponse {
    const record = decodeObject(value, path);
    return {
        id: requireString(record.id, `${path}.id`),
        file_name: requireString(record.file_name, `${path}.file_name`),
        status: requireString(record.status, `${path}.status`),
        chunk_count: requireNumber(record.chunk_count, `${path}.chunk_count`),
        message: requireString(record.message, `${path}.message`),
    };
}
