/**
 * Public interface of the Knowledge capability (spec-09).
 *
 * Consumers (meetings, persona-catalog, routes) import from this module only.
 * It exposes use-case clients and components, never repositories or adapters.
 */
export {
    documentClient,
    documentKeys,
    decodeDocument,
    decodeDocumentList,
    decodeIngestionProgress,
    decodeUploadReceipt,
    stackClient,
    stackKeys,
    useCreateStack,
    useDeleteDocument,
    useDeleteStack,
    useDocumentOperation,
    useDocuments,
    useRetryIngestion,
    useStack,
    useStacks,
    useUpdateStack,
    useUploadDocument,
    useUploadMeetingDocument,
    type Document,
    type DocumentRecord,
    type DocumentScope,
    type DocumentUploadInput,
    type DocumentUploadResponse,
    type IngestionProgress,
    type IngestionStatus,
    type KnowledgeStack,
    type KnowledgeStackInput,
    type KnowledgeStackListResponse,
    type KnowledgeStackUpdate,
    type UploadReceipt,
} from './api';
export { DocumentPanel, type DocumentPanelProps } from './components/DocumentPanel';
export { StackEditor, type StackEditorProps } from './components/StackEditor';
export { StackList, type StackListProps } from './components/StackList';
export { UploadProgress, type UploadProgressProps } from './components/UploadProgress';
export { useDocumentUpload, type DocumentUploadState, type UseDocumentUploadResult } from './hooks/useDocumentUpload';
