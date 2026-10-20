/**
 * Public interface of the knowledge document capability (spec-05).
 *
 * Curated root barrel mirroring the api barrel. Import boundaries point
 * consumers at this module, never at deep paths inside the feature.
 */
export {
    documentClient,
    documentKeys,
    decodeDocumentUploadResponse,
    useUploadMeetingDocument,
    stackClient,
    type DocumentUploadInput,
    type DocumentUploadResponse,
    type KnowledgeStack,
    type KnowledgeStackListResponse,
} from './api';
