/**
 * Live evidence adapter (spec 21).
 *
 * Resolves live citations and ready documents to the exact retained revision,
 * then loads bytes from the same-origin authorized revision route. The private
 * Storage bucket is never exposed: this adapter only knows document/revision
 * ids and the Knowledge HTTP surface.
 */
import { documentClient, type Document } from '@/features/knowledge';
import { isApiError } from '@/shared/api/errors';
import { requestBytes, type ByteResponse } from '@/shared/api/transport';
import {
    EVIDENCE_MAX_BYTES,
    EVIDENCE_MAX_TEXT_CHARACTERS,
    EvidenceLoadError,
    evidenceContentKind,
    type EvidenceCitationRef,
    type EvidenceContent,
    type EvidenceDescriptor,
    type EvidenceDerivedFrom,
    type EvidenceMediaType,
    type MeetingsEvidenceApi,
} from '../evidence/contract';

export const LIVE_EVIDENCE_PREFIX = 'live';

export function liveEvidenceId(documentId: string, revisionId: string): string {
    return `${LIVE_EVIDENCE_PREFIX}:${documentId}:${revisionId}`;
}

export function parseLiveEvidenceId(
    evidenceId: string
): { documentId: string; revisionId: string } | null {
    const [prefix, documentId, revisionId] = evidenceId.split(':');
    if (prefix !== LIVE_EVIDENCE_PREFIX || !documentId || !revisionId) {
        return null;
    }
    return { documentId, revisionId };
}

function normalizeFileType(fileType: string | null | undefined): string {
    if (!fileType) {
        return '';
    }
    const lower = fileType.toLowerCase();
    const slash = lower.lastIndexOf('/');
    const value = slash >= 0 ? lower.slice(slash + 1) : lower;
    return value.replace(/^\./, '').replace(/\+.*$/, '');
}

interface MediaMapping {
    media_type: EvidenceMediaType;
    derived_from: EvidenceDerivedFrom | null;
}

export function mediaForFileType(fileType: string | null | undefined): MediaMapping {
    switch (normalizeFileType(fileType)) {
        case 'pdf':
            return { media_type: 'application/pdf', derived_from: null };
        case 'md':
        case 'markdown':
            return { media_type: 'text/markdown', derived_from: null };
        case 'csv':
            return { media_type: 'text/csv', derived_from: null };
        case 'docx':
            return { media_type: 'text/plain', derived_from: 'docx' };
        case 'xlsx':
            return { media_type: 'text/plain', derived_from: 'xlsx' };
        case 'json':
            return { media_type: 'application/json', derived_from: null };
        case 'txt':
        case 'text':
        default:
            return { media_type: 'text/plain', derived_from: null };
    }
}

function mediaForFileName(fileName: string | null | undefined): MediaMapping {
    const extension = fileName?.split('.').pop() ?? '';
    return mediaForFileType(extension);
}

function shortRevision(revisionId: string | null | undefined): string | null {
    return revisionId ? revisionId.slice(0, 8) : null;
}

/**
 * Maps a live document row to the shared descriptor. Only a ready document
 * with a retained revision gets a preview action; every other state stays
 * visible but honestly unavailable.
 */
export function liveDescriptorForDocument(document: Document): EvidenceDescriptor {
    const media = mediaForFileType(document.file_type);
    const revisionId = document.revision_id ?? null;
    const ready = document.status === 'ready' && Boolean(revisionId);
    const revisionLabel = shortRevision(revisionId);
    return {
        evidence_id: liveEvidenceId(document.id, revisionId ?? 'none'),
        title: document.file_name,
        media_type: media.media_type,
        size_bytes: document.file_size_bytes ?? null,
        readiness: ready ? 'ready' : 'unavailable',
        provenance: {
            label: 'Live document',
            source: 'Uploaded meeting document',
            authored: true,
            detail: revisionLabel
                ? `Revision ${revisionLabel} · ${document.revision_state ?? document.status}`
                : `Status ${document.status}`,
        },
        derived_from: media.derived_from,
        unavailable_reason: ready
            ? null
            : 'This document has no retained ready revision to preview.',
    };
}

function unavailableCitationDescriptor(
    citation: EvidenceCitationRef,
    reason: string
): EvidenceDescriptor {
    const media = mediaForFileName(citation.title);
    return {
        evidence_id: `live:unresolved:${citation.document_id ?? 'unknown'}`,
        title: citation.title ?? citation.source ?? 'Evidence',
        media_type: media.media_type,
        size_bytes: null,
        readiness: 'unavailable',
        provenance: {
            label: citation.source ?? 'Live citation',
            source: citation.title ?? null,
        },
        derived_from: media.derived_from,
        unavailable_reason: reason,
    };
}

function mapTransportError(error: unknown): EvidenceLoadError {
    if (error instanceof EvidenceLoadError) {
        return error;
    }
    if (isApiError(error)) {
        if (error.kind === 'aborted') {
            return new EvidenceLoadError('aborted', 'Preview request was cancelled.', {
                retryable: false,
                cause: error,
            });
        }
        if (error.kind === 'network') {
            const offline =
                typeof navigator !== 'undefined' && navigator.onLine === false;
            return new EvidenceLoadError(
                offline ? 'offline' : 'network',
                offline
                    ? 'You are offline. Reconnect and retry the preview.'
                    : 'The evidence could not be reached. Check your connection and retry.',
                { cause: error }
            );
        }
        switch (error.status) {
            case 404:
            case 410:
            case 503:
                return new EvidenceLoadError(
                    'unavailable',
                    'This revision is no longer available for preview.',
                    { retryable: false, cause: error }
                );
            case 413:
                return new EvidenceLoadError('too_large', 'This file is too large to preview.', {
                    retryable: false,
                    cause: error,
                });
            case 422:
                return new EvidenceLoadError(
                    'unsupported',
                    'This format cannot be previewed.',
                    { retryable: false, cause: error }
                );
            default:
                return new EvidenceLoadError(
                    'http',
                    error.detail || 'The evidence request failed.',
                    { cause: error }
                );
        }
    }
    return new EvidenceLoadError('unknown', 'The evidence preview failed.', { cause: error });
}

function textContent(
    descriptor: EvidenceDescriptor,
    bytes: Uint8Array
): EvidenceContent {
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const truncated = decoded.length > EVIDENCE_MAX_TEXT_CHARACTERS;
    const text = truncated ? decoded.slice(0, EVIDENCE_MAX_TEXT_CHARACTERS) : decoded;
    const kind = evidenceContentKind(descriptor);
    return {
        kind: kind === 'pdf' ? 'text' : kind,
        text,
        truncated,
        derived_from: descriptor.derived_from ?? null,
    };
}

export interface LiveEvidenceDeps {
    getDocument?: (documentId: string) => Promise<Document>;
    listDocuments?: (meetingId: string) => Promise<Document[]>;
    fetchBytes?: typeof requestBytes;
}

export function createLiveEvidence(deps: LiveEvidenceDeps = {}): MeetingsEvidenceApi {
    const getDocument = deps.getDocument ?? ((id: string) => documentClient.get(id));
    const listDocuments =
        deps.listDocuments ?? ((meetingId: string) => documentClient.list({ meetingId }));
    const fetchBytes = deps.fetchBytes ?? requestBytes;

    return {
        async list(scopeId?: string): Promise<EvidenceDescriptor[]> {
            if (!scopeId) {
                return [];
            }
            const documents = await listDocuments(scopeId);
            return documents.map(liveDescriptorForDocument);
        },

        async resolveCitation(
            citation: EvidenceCitationRef
        ): Promise<EvidenceDescriptor | null> {
            const documentId = citation.document_id ?? null;
            const revisionId = citation.revision_id ?? null;
            if (!documentId || !revisionId) {
                return null;
            }
            try {
                const document = await getDocument(documentId);
                const descriptor = liveDescriptorForDocument(document);
                if (document.revision_id === revisionId) {
                    return descriptor;
                }
                const media = mediaForFileType(document.file_type);
                return {
                    ...descriptor,
                    evidence_id: liveEvidenceId(document.id, revisionId),
                    readiness: 'ready',
                    provenance: {
                        ...descriptor.provenance,
                        detail: `Revision ${shortRevision(revisionId)} · retained`,
                    },
                    derived_from: media.derived_from,
                    unavailable_reason: null,
                };
            } catch (error) {
                if (isApiError(error) && error.status === 404) {
                    return unavailableCitationDescriptor(
                        citation,
                        'This document is no longer available for preview.'
                    );
                }
                return unavailableCitationDescriptor(
                    citation,
                    'The evidence could not be resolved right now. Retry from the citation.'
                );
            }
        },

        async load(
            descriptor: EvidenceDescriptor,
            options: { signal: AbortSignal }
        ): Promise<EvidenceContent> {
            if (descriptor.readiness !== 'ready') {
                throw new EvidenceLoadError(
                    'unavailable',
                    descriptor.unavailable_reason ?? 'This evidence is unavailable.',
                    { retryable: false }
                );
            }
            const identity = parseLiveEvidenceId(descriptor.evidence_id);
            if (!identity || identity.revisionId === 'none') {
                throw new EvidenceLoadError(
                    'unavailable',
                    'This evidence has no retained revision identity.',
                    { retryable: false }
                );
            }
            const representation = descriptor.derived_from ? 'text' : 'original';
            let response: ByteResponse;
            try {
                response = await fetchBytes(
                    `/documents/${encodeURIComponent(identity.documentId)}/revisions/${encodeURIComponent(identity.revisionId)}/content`,
                    {
                        query: { representation },
                        headers: { Accept: descriptor.media_type },
                        signal: options.signal,
                    }
                );
            } catch (error) {
                throw mapTransportError(error);
            }

            if (response.bytes.length > EVIDENCE_MAX_BYTES) {
                throw new EvidenceLoadError('too_large', 'This file is too large to preview.', {
                    retryable: false,
                });
            }
            const expectedType = descriptor.media_type.split(';')[0]?.trim().toLowerCase();
            const actualType = response.contentType?.split(';')[0]?.trim().toLowerCase();
            if (actualType && expectedType && actualType !== expectedType) {
                throw new EvidenceLoadError(
                    'wrong_type',
                    `The server returned ${actualType} instead of ${expectedType}.`,
                    { retryable: false }
                );
            }

            if (descriptor.media_type === 'application/pdf') {
                const signature = '%PDF-';
                const prefix = new TextDecoder('ascii').decode(
                    response.bytes.slice(0, signature.length)
                );
                if (prefix !== signature) {
                    throw new EvidenceLoadError(
                        'integrity',
                        'The PDF bytes failed validation.',
                        { retryable: false }
                    );
                }
                const copy = response.bytes.slice();
                const blob = new Blob([copy.buffer as ArrayBuffer], {
                    type: 'application/pdf',
                });
                const url = URL.createObjectURL(blob);
                return {
                    kind: 'pdf',
                    url,
                    size_bytes: response.bytes.length,
                    dispose: () => URL.revokeObjectURL(url),
                };
            }

            return textContent(descriptor, response.bytes);
        },
    };
}
