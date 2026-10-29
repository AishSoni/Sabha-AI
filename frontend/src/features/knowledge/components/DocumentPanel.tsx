'use client';

/**
 * Document panel for one Knowledge scope (meeting, persona, or stack).
 *
 * Server state lives in TanStack Query. A file is uploaded once; the pending
 * receipt is observed by operation id, and retries never resend the original
 * bytes. Deleting a document revokes eligibility and redacts retained
 * evidence on the backend before the row is removed from this list.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    FileText,
    Loader2,
    RotateCcw,
    Trash2,
    Upload,
    XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    useDeleteDocument,
    useDocuments,
    useRetryIngestion,
    type DocumentScope,
} from '../api';
import type { Document, UploadReceipt } from '../api/decoders';
import { useDocumentUpload } from '../hooks/useDocumentUpload';
import { UploadProgress } from './UploadProgress';

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

function statusBadge(document: Document) {
    if (document.status === 'ready') {
        return (
            <Badge variant="secondary" className="gap-1 text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Ready ({document.chunk_count} chunks)
            </Badge>
        );
    }
    if (document.status === 'failed') {
        return (
            <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Failed
            </Badge>
        );
    }
    if (document.status === 'revoked' || document.status === 'unavailable') {
        return (
            <Badge variant="outline" className="gap-1 text-zinc-400">
                <XCircle className="h-3 w-3" />
                {document.status === 'revoked' ? 'Revoked' : 'Unavailable — re-upload'}
            </Badge>
        );
    }
    return (
        <Badge variant="secondary" className="gap-1 text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            {document.status === 'pending' ? 'Queued' : 'Indexing'}
        </Badge>
    );
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
    const inputRef = useRef<HTMLInputElement>(null);
    const [receipt, setReceipt] = useState<UploadReceipt | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const scopeLabel = useMemo(() => {
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
            setLocalError(cause instanceof Error ? cause.message : 'The upload failed.');
        } finally {
            if (inputRef.current) inputRef.current.value = '';
        }
    }

    async function handleDelete(document: Document) {
        if (!window.confirm(`Delete "${document.file_name}"? It will stop being eligible for retrieval.`)) {
            return;
        }
        setLocalError(null);
        setDeleting(document.id);
        try {
            await remove.mutateAsync(document.id);
        } catch (cause) {
            setLocalError(cause instanceof Error ? cause.message : 'The document could not be deleted.');
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
            setLocalError(cause instanceof Error ? cause.message : 'The retry could not be queued.');
        }
    }

    return (
        <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                        <FileText className="h-5 w-5 text-zinc-400" />
                        {title ?? 'Documents'}
                    </CardTitle>
                    <CardDescription>
                        {description ??
                            `Files in this ${scopeLabel} become eligible for retrieval only after indexing is confirmed.`}
                    </CardDescription>
                </div>
                <div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                        className="hidden"
                        onChange={(event) => void handleFile(event.target.files?.[0])}
                    />
                    <Button
                        type="button"
                        size="sm"
                        disabled={upload.uploading}
                        onClick={() => inputRef.current?.click()}
                    >
                        {upload.uploading ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                            <Upload className="mr-1 h-4 w-4" />
                        )}
                        Upload
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {receipt?.operationId && (
                    <UploadProgress
                        operationId={receipt.operationId}
                        fileName={receipt.file_name}
                        onRetry={handleRetry}
                        retrying={retry.isPending}
                    />
                )}
                {receipt?.state === 'ready' && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        {receipt.file_name} is ready for retrieval.
                    </div>
                )}
                {(localError || upload.error) && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                        <AlertTriangle className="h-4 w-4" />
                        {localError ?? upload.error?.message}
                    </div>
                )}

                {documents.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading documents…
                    </div>
                )}
                {documents.isError && (
                    <div className="flex items-center gap-2 text-sm text-red-400">
                        <AlertTriangle className="h-4 w-4" />
                        Documents are temporarily unavailable.
                    </div>
                )}
                {!documents.isLoading && !documents.isError && (documents.data?.length ?? 0) === 0 && (
                    <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                        No documents yet. Upload a PDF, DOCX, XLSX, CSV, TXT, or Markdown file.
                    </p>
                )}

                {(documents.data ?? []).map((document) => (
                    <div
                        key={document.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                    >
                        <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-200">{document.file_name}</p>
                            <p className="text-xs text-zinc-500">
                                {document.file_type.toUpperCase()} ·{' '}
                                {(document.file_size_bytes / 1024).toFixed(0)} KB
                                {document.error_message ? ` · ${document.error_message}` : ''}
                            </p>
                        </div>
                        {statusBadge(document)}
                        {renderPreviewAction?.(document)}
                        {document.operation_id &&
                            (document.status === 'failed' || document.status === 'pending') && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={retry.isPending}
                                    onClick={() => void handleRetry(document.operation_id!)}
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300"
                            disabled={deleting === document.id}
                            onClick={() => void handleDelete(document)}
                        >
                            {deleting === document.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                            )}
                        </Button>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
