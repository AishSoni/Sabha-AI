/**
 * Public interface of the document knowledge capability (spec-05).
 *
 * Curated barrel: no wildcards. Consumers (like the meetings feature) go
 * through these names only.
 */
export { documentKeys } from './keys';
export { documentClient, type DocumentUploadInput } from './client';
export { decodeDocumentUploadResponse, type DocumentUploadResponse } from './decoders';
export { useUploadMeetingDocument } from './mutations';
export { stackClient, type KnowledgeStack, type KnowledgeStackListResponse } from './stacks';
