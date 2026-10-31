'use client';

/**
 * Document panel for one Knowledge scope (meeting, persona, or stack).
 *
 * The live adapter owns TanStack Query and mutations; the shared
 * `DocumentPanelView` owns the presentation. A demo adapter passes simulated
 * local state and callbacks to the same view.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
    useDeleteDocument,
    useDocuments,
    useRetryIngestion,
    type DocumentScope,
} from '../api';
import type { Document, UploadReceipt } from '../api/decoders';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import {
    DocumentPanelView,
    type DocumentPanelViewProps,
} from '../presentation/document-panel';

export interface DocumentPanelProps {
    scope: DocumentScope;
    title?: string;
    description?: string;
    /**
     * Optional preview action for a row. The composing runtime decides which
     * states are previewable so the knowledge feature never imports evidence
     * UI or a meetings runtime.
     */
    renderPreviewAction?: (document: Document) => ReactNode;
}

function receiptView(receipt: UploadReceipt | null) {
    if (!receipt) return null;
    return {
        operationId: receipt.operationId ?? undefined,
        fileName: receipt.file_name,
        state: receipt.state,
    };
}

export function DocumentPanel({
    scope,
    title,
    description,
    renderPreviewAction,
}: DocumentPanelProps) {
    const documents = useDocuments(scope);
    const upload = useDocumentUpload(scope);
    const retry = useRetryIngestion(scope);
    const remove = useDeleteDocument(scope);
    const [receipt, setReceipt] = useState<UploadReceipt | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const scopeLabel = useMemo<'meeting' | 'participant' | 'stack'>(() => {
        if (scope.meetingId) return 'meeting';
        if (scope.personaId) return 'participant';
        return 'stack';
    }, [scope]);

    async function handleFile(file: File | undefined) {
        if (!file) return;
        setLocalError(null);
        try {
            const next = await upload.upload(file);
            setReceipt(next);
        } catch (cause) {
            setLocalError(
                cause instanceof Error ? cause.message : 'The upload failed.'
            );
        }
    }

    async function handleDelete(document: Document) {
        if (
            !window.confirm(
                `Delete "${document.file_name}"? It will stop being eligible for retrieval.`
            )
        ) {
            return;
        }
        setLocalError(null);
        setDeleting(document.id);
        try {
            await remove.mutateAsync(document.id);
        } catch (cause) {
            setLocalError(
                cause instanceof Error
                    ? cause.message
                    : 'The document could not be deleted.'
            );
        } finally {
            setDeleting(null);
        }
    }

    async function handleRetry(operationId: string) {
        setLocalError(null);
        try {
            const next = await retry.mutateAsync(operationId);
            setReceipt(next);
        } catch (cause) {
            setLocalError(
                cause instanceof Error
                    ? cause.message
                    : 'The retry could not be queued.'
            );
        }
    }

    const viewProps: DocumentPanelViewProps = {
        scopeLabel,
        title,
        description,
        documents: documents.data,
        isLoading: documents.isLoading,
        isError: documents.isError,
        uploading: upload.uploading,
        uploadError: upload.error?.message,
        receipt: receiptView(receipt),
        localError,
        deletingId: deleting,
        retrying: retry.isPending,
        onUploadFile: (file) => void handleFile(file),
        onRetry: (operationId) => void handleRetry(operationId),
        onDelete: (document) => void handleDelete(document as Document),
        renderPreviewAction: renderPreviewAction
            ? (document) => renderPreviewAction(document as Document)
            : undefined,
    };

    return <DocumentPanelView {...viewProps} />;
}
