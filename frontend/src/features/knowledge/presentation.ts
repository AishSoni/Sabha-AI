/**
 * Safe presentation entry for knowledge (spec-23).
 *
 * Demo adapters import this module, never the live client/hook barrel. Every
 * export is a pure screen or a structural view type.
 */
export {
    DocumentPanelView,
    type DocumentPanelViewProps,
} from "./presentation/document-panel";
export {
    StackListView,
    type StackListViewProps,
} from "./presentation/stack-list";
export {
    StackEditorView,
    type StackEditorViewProps,
} from "./presentation/stack-editor";
export {
    UploadProgressView,
    type UploadProgressViewProps,
} from "./presentation/upload-progress";
export {
    SamplePicker,
    type SamplePickerProps,
} from "./presentation/sample-picker";
export type {
    IngestionProgressView,
    KnowledgeDocumentView,
    KnowledgeHrefs,
    KnowledgeStackView,
    KnowledgeUploadReceiptView,
} from "./presentation/contract";
