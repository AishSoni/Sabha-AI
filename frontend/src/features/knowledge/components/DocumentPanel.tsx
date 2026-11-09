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
import { createRequestKey } from '@/shared/api/request-key';
import {
    documentClient,
    documentKeys,
    useDeleteDocument,
    useDocumentOperation,
    useDocuments,
    useRetryIngestion,
    type DocumentScope,
} from '../api';
import type {
    Document,
    IngestionProgress,
    UploadReceipt,
} from '../api/decoders';
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

interface UploadIntent {
    requestKey: string;
    fileName: string;
}

interface StoredUpload {
    intent: UploadIntent | null;
    receipt: UploadReceipt | null;
}

function normalizeReceipt(value: unknown): UploadReceipt | null {
    if (!value || typeof value !== 'object') return null;
    const receipt = value as Partial<UploadReceipt>;
    if (receipt.state !== 'pending' && receipt.state !== 'ready') {
        return null;
    }
    if (
        typeof receipt.documentId !== 'string' ||
        typeof receipt.file_name !== 'string'
    ) {
        return null;
    }
    if (receipt.state === 'pending' && typeof receipt.operationId !== 'string') {
        return null;
    }
    return {
        state: receipt.state,
        documentId: receipt.documentId,
        operationId: receipt.operationId ?? null,
        revisionId: receipt.revisionId ?? null,
        file_name: receipt.file_name,
        status: typeof receipt.status === 'string' ? receipt.status : 'processing',
        chunk_count:
            typeof receipt.chunk_count === 'number' ? receipt.chunk_count : 0,
        message: typeof receipt.message === 'string' ? receipt.message : '',
    };
}

function readStoredUpload(scope: DocumentScope): StoredUpload {
    if (typeof window === 'undefined') return { intent: null, receipt: null };
    try {
        const raw = window.sessionStorage.getItem(receiptStorageKey(scope));
        if (!raw) return { intent: null, receipt: null };
        const value = JSON.parse(raw) as Record<string, unknown> | null;
        if (!value) return { intent: null, receipt: null };
        // Legacy entries stored the receipt object directly.
        if (!('requestKey' in value) && !('receipt' in value)) {
            return { intent: null, receipt: normalizeReceipt(value) };
        }
        const requestKey = value.requestKey;
        const fileName = value.fileName;
        const intent =
            typeof requestKey === 'string' &&
            requestKey.length > 0 &&
            typeof fileName === 'string' &&
            fileName.length > 0
                ? { requestKey, fileName }
                : null;
        return { intent, receipt: normalizeReceipt(value.receipt) };
    } catch {
        return { intent: null, receipt: null };
    }
}

function progressToReceipt(progress: IngestionProgress): UploadReceipt {
    return {
        state: progress.state === 'ready' ? 'ready' : 'pending',
        documentId: progress.documentId,
        operationId: progress.operationId,
        revisionId: progress.revisionId,
        file_name: progress.fileName,
        status: progress.documentStatus ?? progress.state,
        chunk_count: progress.chunkCount,
        message: '',
    };
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
    const [storedUpload, setStoredUpload] = useState<StoredUpload>(() =>
        readStoredUpload(scope)
    );
    const receipt = storedUpload.receipt;
    const intent = storedUpload.intent;
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
        setStoredUpload(readStoredUpload(scope));
    }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!intent || receipt) return;
        let cancelled = false;
        documentClient
            .findUpload(intent.requestKey, scope)
            .then((progress) => {
                if (!cancelled) {
                    rememberUpload({
                        intent,
                        receipt: progressToReceipt(progress),
                    });
                }
            })
            .catch(() => {
                // A miss means the original submission never reached
                // admission. Keep the intent so choosing the file again
                // reuses the same key instead of creating a second upload.
            });
        return () => {
            cancelled = true;
        };
    }, [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!progressState || !TERMINAL_OPERATION_STATES.has(progressState)) {
            return;
        }
        void queryClient.invalidateQueries({
            queryKey: documentKeys.scope(scope),
        });
    }, [progressState, queryClient, storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    function rememberUpload(next: StoredUpload) {
        setStoredUpload(next);
        if (typeof window === 'undefined') return;
        try {
            if (next.intent || next.receipt) {
                window.sessionStorage.setItem(
                    storageKey,
                    JSON.stringify({
                        requestKey: next.intent?.requestKey ?? null,
                        fileName: next.intent?.fileName ?? null,
                        receipt: next.receipt,
                    })
                );
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
        const requestKey =
            intent && intent.fileName === file.name
                ? intent.requestKey
                : createRequestKey('upload');
        const nextIntent = { requestKey, fileName: file.name };
        rememberUpload({ intent: nextIntent, receipt: null });
        try {
            const next = await upload.upload(file, requestKey);
            rememberUpload({ intent: nextIntent, receipt: next });
        } catch (cause) {
            const recovered = await documentClient
                .findUpload(requestKey, scope)
                .catch(() => null);
            if (recovered) {
                rememberUpload({
                    intent: nextIntent,
                    receipt: progressToReceipt(recovered),
                });
                return;
            }
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
                rememberUpload({ intent: null, receipt: null });
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
            rememberUpload({
                intent,
                receipt: next,
            });
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
