/**
 * Public interface of the Knowledge capability (spec-09).
 *
 * Curated barrel: no wildcards. Consumers (like meetings and persona-catalog)
 * go through these names only.
 */
export { documentClient, type DocumentScope, type DocumentUploadInput } from './client';
export {
    decodeDocument,
    decodeDocumentList,
    decodeIngestionProgress,
    decodeUploadReceipt,
    type Document,
    type DocumentRecord,
    type DocumentUploadResponse,
    type IngestionProgress,
    type IngestionStatus,
    type UploadReceipt,
} from './decoders';
export { documentKeys, stackKeys } from './keys';
export {
    useDeleteDocument,
    useCreateStack,
    useDeleteStack,
    useRetryIngestion,
    useUpdateStack,
    useUploadDocument,
    useUploadMeetingDocument,
} from './mutations';
export { useDocumentOperation, useDocuments, useStack, useStacks } from './queries';
export {
    stackClient,
    type KnowledgeStack,
    type KnowledgeStackInput,
    type KnowledgeStackListResponse,
    type KnowledgeStackUpdate,
} from './stacks';
