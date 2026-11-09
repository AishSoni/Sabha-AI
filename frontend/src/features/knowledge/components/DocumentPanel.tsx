'use client';

/**
 * Document panel for one Knowledge scope (meeting, persona, or stack).
 *
 * The live adapter owns TanStack Query and mutations; the shared
 * `DocumentPanelView` owns the presentation. A demo adapter passes simulated
 * local state and callbacks to the same view.
 *
 * The receipt is an observation handle, not a readiness claim: the live
 * adapter follows the canonical operation read model and keeps the handle in
 * session storage so a remount continues observing the same durable work.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    documentKeys,
    useDeleteDocument,
    useDocumentOperation,
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

const RECEIPT_STORAGE_PREFIX = 'sabha:knowledge:receipt:';
const TERMINAL_OPERATION_STATES = new Set(['ready', 'failed', 'revoked']);

function scopeIdentity(scope: DocumentScope): string {
    if (scope.meetingId) return `meeting:${scope.meetingId}`;
    if (scope.personaId) return `persona:${scope.personaId}`;
    if (scope.stackId) return `stack:${scope.stackId}`;
    return 'unknown';
}

function receiptStorageKey(scope: DocumentScope): string {
    return `${RECEIPT_STORAGE_PREFIX}${scopeIdentity(scope)}`;
}

function readStoredReceipt(scope: DocumentScope): UploadReceipt | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(receiptStorageKey(scope));
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<UploadReceipt> | null;
        if (!value || (value.state !== 'pending' && value.state !== 'ready')) {
            return null;
        }
        if (
            typeof value.documentId !== 'string' ||
            typeof value.file_name !== 'string'
        ) {
            return null;
        }
        if (value.state === 'pending' && typeof value.operationId !== 'string') {
            return null;
        }
        return {
            state: value.state,
            documentId: value.documentId,
            operationId: value.operationId ?? null,
            revisionId: value.revisionId ?? null,
            file_name: value.file_name,
            status: typeof value.status === 'string' ? value.status : 'processing',
            chunk_count:
                typeof value.chunk_count === 'number' ? value.chunk_count : 0,
            message: typeof value.message === 'string' ? value.message : '',
        };
    } catch {
        return null;
    }
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
    const queryClient = useQueryClient();
    const documents = useDocuments(scope);
    const upload = useDocumentUpload(scope);
    const retry = useRetryIngestion(scope);
    const remove = useDeleteDocument(scope);
    const [receipt, setReceipt] = useState<UploadReceipt | null>(() =>
        readStoredReceipt(scope)
    );
    const [localError, setLocalError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const storageKey = receiptStorageKey(scope);
    const progressQuery = useDocumentOperation(receipt?.operationId);
    const progressState = progressQuery.data?.state;

    const scopeLabel = useMemo<'meeting' | 'participant' | 'stack'>(() => {
        if (scope.meetingId) return 'meeting';
        if (scope.personaId) return 'participant';
        return 'stack';
    }, [scope]);

    useEffect(() => {
        setReceipt(readStoredReceipt(scope));
    }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!progressState || !TERMINAL_OPERATION_STATES.has(progressState)) {
            return;
        }
        void queryClient.invalidateQueries({
            queryKey: documentKeys.scope(scope),
        });
    }, [progressState, queryClient, storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    function rememberReceipt(next: UploadReceipt | null) {
        setReceipt(next);
        if (typeof window === 'undefined') return;
        try {
            if (next) {
                window.sessionStorage.setItem(storageKey, JSON.stringify(next));
            } else {
                window.sessionStorage.removeItem(storageKey);
            }
        } catch {
            // Storage can be unavailable in private or quota-limited contexts;
            // the in-memory observation handle still works.
        }
    }

    async function handleFile(file: File | undefined) {
        if (!file) return;
        setLocalError(null);
        try {
            const next = await upload.upload(file);
            rememberReceipt(next);
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
            if (receipt?.documentId === document.id) {
                rememberReceipt(null);
            }
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
            rememberReceipt(next);
        } catch (cause) {
            setLocalError(
                cause instanceof Error
                    ? cause.message
                    : 'The retry could not be queued.'
            );
        }
    }

    const progress = progressQuery.data
        ? {
              state: progressQuery.data.state,
              documentId: progressQuery.data.documentId,
              documentStatus: progressQuery.data.documentStatus,
              chunkCount: progressQuery.data.chunkCount,
              errorMessage: progressQuery.data.errorMessage,
              fileName: progressQuery.data.fileName,
          }
        : null;

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
        progress,
        progressError: progressQuery.isError,
        refreshingProgress: progressQuery.isFetching,
        localError,
        deletingId: deleting,
        retrying: retry.isPending,
        onUploadFile: (file) => void handleFile(file),
        onRetry: (operationId) => void handleRetry(operationId),
        onRefreshProgress: () => void progressQuery.refetch(),
        onRefreshDocuments: () => void documents.refetch(),
        refreshingDocuments: documents.isFetching,
        onDelete: (document) => void handleDelete(document as Document),
        renderPreviewAction: renderPreviewAction
            ? (document) => renderPreviewAction(document as Document)
            : undefined,
    };

    return <DocumentPanelView {...viewProps} />;
}
