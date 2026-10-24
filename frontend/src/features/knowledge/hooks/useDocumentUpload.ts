'use client';

/**
 * Single-file upload state for the Knowledge capability.
 *
 * The receipt returned by the API distinguishes "pending" from "ready".
 * Pending means the backend durably accepted the bytes and the ingestion
 * operation exists; it is not a success state. Consumers must observe the
 * operation (useDocumentOperation) instead of re-uploading the file.
 */
import { useCallback, useState } from 'react';
import { useUploadDocument, type DocumentScope } from '../api';
import type { UploadReceipt } from '../api/decoders';

export interface DocumentUploadState {
    uploading: boolean;
    receipt: UploadReceipt | null;
    error: Error | null;
}

export interface UseDocumentUploadResult extends DocumentUploadState {
    upload: (file: File) => Promise<UploadReceipt>;
    reset: () => void;
}

export function useDocumentUpload(scope: DocumentScope): UseDocumentUploadResult {
    const mutation = useUploadDocument(scope);
    const [receipt, setReceipt] = useState<UploadReceipt | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const upload = useCallback(
        async (file: File) => {
            setError(null);
            try {
                const next = await mutation.mutateAsync({ file, ...scope });
                setReceipt(next);
                return next;
            } catch (cause) {
                const failure = cause instanceof Error ? cause : new Error('Upload failed');
                setError(failure);
                throw failure;
            }
        },
        [mutation, scope],
    );

    const reset = useCallback(() => {
        setReceipt(null);
        setError(null);
    }, []);

    return {
        uploading: mutation.isPending,
        receipt,
        error,
        upload,
        reset,
    };
}
