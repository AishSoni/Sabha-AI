"use client";

/**
 * Pure document panel presentation (spec-23).
 *
 * Server state, uploads, and mutations are injected by the composing adapter.
 * This module never imports a query client or a knowledge API module, so the
 * demo can render the exact same panel with browser-memory state.
 */
import { useRef, type ReactNode } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    FileText,
    Loader2,
    RotateCcw,
    Trash2,
    Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import type {
    KnowledgeDocumentView,
    KnowledgeUploadReceiptView,
} from "./contract";
import { UploadProgressView } from "./upload-progress";

export interface DocumentPanelViewProps {
    scopeLabel: "meeting" | "participant" | "stack" | "workspace";
    title?: string;
    description?: string;
    documents: KnowledgeDocumentView[] | undefined;
    isLoading: boolean;
    isError: boolean;
    uploading: boolean;
    uploadError?: string | null;
    receipt?: KnowledgeUploadReceiptView | null;
    localError?: string | null;
    deletingId?: string | null;
    retrying?: boolean;
    onUploadFile?: (file: File | undefined) => void;
    onRetry: (operationId: string) => void;
    onDelete: (document: KnowledgeDocumentView) => void;
    renderPreviewAction?: (document: KnowledgeDocumentView) => ReactNode;
    /** Demo composition replaces the native chooser with the sample picker. */
    uploadAction?: ReactNode;
    emptyMessage?: string;
}

function statusBadge(document: KnowledgeDocumentView) {
    if (document.status === "ready") {
        return (
            <Badge variant="secondary" className="gap-1 text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Ready ({document.chunk_count} chunks)
            </Badge>
        );
    }
    if (document.status === "failed") {
        return (
            <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Failed
            </Badge>
        );
    }
    if (document.status === "revoked" || document.status === "unavailable") {
        return (
            <Badge variant="outline" className="gap-1 text-zinc-400">
                <AlertTriangle className="h-3 w-3" />
                {document.status === "revoked" ? "Revoked" : "Unavailable — re-upload"}
            </Badge>
        );
    }
    return (
        <Badge variant="secondary" className="gap-1 text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            {document.status === "pending" ? "Queued" : "Indexing"}
        </Badge>
    );
}

export function DocumentPanelView({
    scopeLabel,
    title,
    description,
    documents,
    isLoading,
    isError,
    uploading,
    uploadError,
    receipt,
    localError,
    deletingId,
    retrying,
    onUploadFile,
    onRetry,
    onDelete,
    renderPreviewAction,
    uploadAction,
    emptyMessage,
}: DocumentPanelViewProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle className="flex items-center gap-2 text-white">
                        <FileText className="h-5 w-5 text-zinc-400" />
                        {title ?? "Documents"}
                    </CardTitle>
                    <CardDescription>
                        {description ??
                            `Files in this ${scopeLabel} become eligible for retrieval only after indexing is confirmed.`}
                    </CardDescription>
                </div>
                <div>
                    {uploadAction ?? (
                        <>
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                                className="hidden"
                                onChange={(event) =>
                                    onUploadFile?.(event.target.files?.[0])
                                }
                            />
                            <Button
                                type="button"
                                size="sm"
                                disabled={uploading}
                                onClick={() => inputRef.current?.click()}
                            >
                                {uploading ? (
                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : (
                                    <Upload className="mr-1 h-4 w-4" />
                                )}
                                Upload
                            </Button>
                        </>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {receipt?.operationId && (
                    <UploadProgressView
                        operationId={receipt.operationId}
                        fileName={receipt.fileName}
                        onRetry={onRetry}
                        retrying={retrying}
                    />
                )}
                {receipt?.state === "ready" && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        {receipt.fileName} is ready for retrieval.
                    </div>
                )}
                {(localError || uploadError) && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                        <AlertTriangle className="h-4 w-4" />
                        {localError ?? uploadError}
                    </div>
                )}

                {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading documents…
                    </div>
                )}
                {isError && (
                    <div className="flex items-center gap-2 text-sm text-red-400">
                        <AlertTriangle className="h-4 w-4" />
                        Documents are temporarily unavailable.
                    </div>
                )}
                {!isLoading && !isError && (documents?.length ?? 0) === 0 && (
                    <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                        {emptyMessage ??
                            "No documents yet. Upload a PDF, DOCX, XLSX, CSV, TXT, or Markdown file."}
                    </p>
                )}

                {(documents ?? []).map((document) => (
                    <div
                        key={document.id}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                    >
                        <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-200">
                                {document.file_name}
                            </p>
                            <p className="text-xs text-zinc-500">
                                {document.file_type.toUpperCase()} ·{" "}
                                {(document.file_size_bytes / 1024).toFixed(0)} KB
                                {document.error_message
                                    ? ` · ${document.error_message}`
                                    : ""}
                            </p>
                        </div>
                        {statusBadge(document)}
                        {renderPreviewAction?.(document)}
                        {document.operation_id &&
                            (document.status === "failed" ||
                                document.status === "pending") && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={retrying}
                                    onClick={() => onRetry(document.operation_id!)}
                                    aria-label={`Retry ${document.file_name}`}
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300"
                            disabled={deletingId === document.id}
                            onClick={() => onDelete(document)}
                            aria-label={`Delete ${document.file_name}`}
                        >
                            {deletingId === document.id ? (
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
