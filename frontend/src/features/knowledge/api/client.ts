/**
 * HTTP client for document uploads (spec-05).
 *
 * Multipart transport lives in `/shared/api/transport.c7d63c72`; this feature
 * module only stages the form fields and validates the decoded record.
 */
import { requestForm } from '@/shared/api/transport';
import { decodeDocumentUploadResponse, type DocumentUploadResponse } from './decoders';

export interface DocumentUploadInput {
    file: File;
    meetingId?: string | null;
    personaId?: string | null;
    stackId?: string | null;
}

export const documentClient = {
    upload(input: DocumentUploadInput, init?: { signal?: AbortSignal }): Promise<DocumentUploadResponse> {
        const form = new FormData();
        form.append('file', input.file);
        if (input.meetingId) form.append('meeting_id', input.meetingId);
        if (input.personaId) form.append('persona_id', input.personaId);
        if (input.stackId) form.append('stack_id', input.stackId);
        return requestForm('/documents/upload', form, init).then((body) =>
            decodeDocumentUploadResponse(body, '/documents/upload')
        );
    },
};
