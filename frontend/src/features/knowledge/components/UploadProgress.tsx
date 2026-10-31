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
    onRetry?: (operationId: string) => void;
    retrying?: boolean;
}

export function UploadProgress({
    operationId,
    fileName,
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
                          chunkCount: query.data.chunkCount,
                          errorMessage: query.data.errorMessage,
                          fileName: query.data.fileName,
                      }
                    : null
            }
            isError={query.isError}
            onRetry={onRetry}
            retrying={retrying}
        />
    );
}
