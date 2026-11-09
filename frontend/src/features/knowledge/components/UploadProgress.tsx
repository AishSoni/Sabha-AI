'use client';

/**
 * Durable ingestion progress for one accepted upload operation.
 *
 * The live adapter observes the canonical operation and renders the shared
 * `UploadProgressView`; demo adapters can pass simulated progress instead.
 */
import { useDocumentOperation } from '../api';
import { UploadProgressView } from '../presentation/upload-progress';

export interface UploadProgressProps {
    operationId: string;
    fileName?: string;
    onRefresh?: () => void;
    refreshing?: boolean;
    onRetry?: (operationId: string) => void;
    retrying?: boolean;
}

export function UploadProgress({
    operationId,
    fileName,
    onRefresh,
    refreshing,
    onRetry,
    retrying,
}: UploadProgressProps) {
    const query = useDocumentOperation(operationId);
    return (
        <UploadProgressView
            operationId={operationId}
            fileName={fileName}
            progress={
                query.data
                    ? {
                          state: query.data.state,
                          documentId: query.data.documentId,
                          documentStatus: query.data.documentStatus,
                          chunkCount: query.data.chunkCount,
                          errorMessage: query.data.errorMessage,
                          fileName: query.data.fileName,
                      }
                    : null
            }
            isError={query.isError}
            onRefresh={onRefresh ?? (() => void query.refetch())}
            refreshing={refreshing ?? query.isFetching}
            onRetry={onRetry}
            retrying={retrying}
        />
    );
}
