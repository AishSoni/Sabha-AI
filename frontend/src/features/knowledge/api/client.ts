/**
 * HTTP client for the Knowledge feature (spec-09).
 *
 * Multipart transport lives in `/shared/api/transport`; this module only
 * stages scope fields, calls the module-owned routes, and validates every
 * decoded record before it can enter a query cache.
 */
import { requestLiveForm, requestLiveJson } from '@/shared/access';
import {
    decodeDocument,
    decodeDocumentList,
    decodeIngestionProgress,
    decodeUploadReceipt,
    type Document,
    type IngestionProgress,
    type UploadReceipt,
} from './decoders';

export interface DocumentScope {
    meetingId?: string | null;
    personaId?: string | null;
    stackId?: string | null;
}

export interface DocumentUploadInput extends DocumentScope {
    file: File;
}

function scopeQuery(scope: DocumentScope): { key: 'meeting' | 'persona' | 'stack'; id: string } {
    const provided = [
        scope.meetingId ? (['meeting', scope.meetingId] as const) : null,
        scope.personaId ? (['persona', scope.personaId] as const) : null,
        scope.stackId ? (['stack', scope.stackId] as const) : null,
    ].filter((entry): entry is readonly ['meeting' | 'persona' | 'stack', string] => entry !== null);
    if (provided.length !== 1) {
        throw new Error('Exactly one of meetingId, personaId, or stackId is required');
    }
    const [key, id] = provided[0]!;
    return { key, id };
}

export const documentClient = {
    upload(input: DocumentUploadInput, init?: { signal?: AbortSignal }): Promise<UploadReceipt> {
        const form = new FormData();
        form.append('file', input.file);
        if (input.meetingId) form.append('meeting_id', input.meetingId);
        if (input.personaId) form.append('persona_id', input.personaId);
        if (input.stackId) form.append('stack_id', input.stackId);
        return requestLiveForm('/documents/upload', form, init).then((body) =>
            decodeUploadReceipt(body, '/documents/upload')
        );
    },

    getOperation(operationId: string, init?: { signal?: AbortSignal }): Promise<IngestionProgress> {
        return requestLiveJson(`/documents/operations/${operationId}`, init).then((body) =>
            decodeIngestionProgress(body, `/documents/operations/${operationId}`)
        );
    },

    retryOperation(operationId: string, init?: { signal?: AbortSignal }): Promise<UploadReceipt> {
        return requestLiveJson(`/documents/operations/${operationId}/retry`, {
            method: 'POST',
            ...init,
        }).then((body) =>
            decodeUploadReceipt(body, `/documents/operations/${operationId}/retry`)
        );
    },

    list(scope: DocumentScope, init?: { signal?: AbortSignal }): Promise<Document[]> {
        const { key, id } = scopeQuery(scope);
        const path = `/documents/${key}/${id}`;
        return requestLiveJson(path, init).then((body) => decodeDocumentList(body, path));
    },

    get(documentId: string, init?: { signal?: AbortSignal }): Promise<Document> {
        const path = `/documents/${documentId}`;
        return requestLiveJson(path, init).then((body) => decodeDocument(body, path));
    },

    delete(documentId: string, init?: { signal?: AbortSignal }): Promise<{ message: string; id: string }> {
        return requestLiveJson(`/documents/${documentId}`, { method: 'DELETE', ...init });
    },
};
