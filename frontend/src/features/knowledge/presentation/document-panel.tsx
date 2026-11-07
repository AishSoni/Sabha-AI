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
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Notice } from "@/components/ui/notice";
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
            <StatusBadge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>
                Ready ({document.chunk_count} chunks)
            </StatusBadge>
        );
    }
    if (document.status === "failed") {
        return (
            <StatusBadge tone="danger" icon={<AlertTriangle className="h-3 w-3" />}>
                Failed
            </StatusBadge>
        );
    }
    if (document.status === "revoked" || document.status === "unavailable") {
        return (
            <StatusBadge tone="neutral" icon={<AlertTriangle className="h-3 w-3" />}>
                {document.status === "revoked" ? "Revoked" : "Unavailable — re-upload"}
            </StatusBadge>
        );
    }
    const label =
        document.status === "pending"
            ? "Queued"
            : document.status === "processing"
              ? "Processing"
              : document.status === "uploading"
                ? "Uploading"
                : document.status === "staged"
                  ? "Staged"
                  : document.status;
    return <StatusBadge tone="pending">{label}</StatusBadge>;
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
        <section className="material-raised rounded-group border border-separator">
            <div className="flex flex-row items-start justify-between gap-4 border-b border-separator p-4">
                <div>
                    <h2 className="flex items-center gap-2 type-section-title text-ink">
                        <FileText aria-hidden="true" className="size-5 text-ink-muted" />
                        {title ?? "Documents"}
                    </h2>
                    <p className="mt-1 max-w-[68ch] type-body text-ink-secondary">
                        {description ??
                            `Files in this ${scopeLabel} become eligible for retrieval only after indexing is confirmed.`}
                    </p>
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
                                busy={uploading}
                                busyLabel="Uploading"
                                onClick={() => inputRef.current?.click()}
                            >
                                <Upload aria-hidden="true" />
                                Upload
                            </Button>
                        </>
                    )}
                </div>
            </div>
            <div className="space-y-3 p-4">
                {receipt?.operationId && (
                    <UploadProgressView
                        operationId={receipt.operationId}
                        fileName={receipt.fileName}
                        onRetry={onRetry}
                        retrying={retrying}
                    />
                )}
                {receipt?.state === "ready" && (
                    <div
                        role="status"
                        className="flex items-center gap-2 rounded-group border border-success/40 bg-success-soft px-3 py-2 type-body text-success"
                    >
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                        {receipt.fileName} is ready for retrieval.
                    </div>
                )}
                {(localError || uploadError) && (
                    <Notice tone="danger">
                        {localError ?? uploadError}
                    </Notice>
                )}

                {isLoading && (
                    <div role="status" className="flex items-center gap-2 type-body text-ink-muted">
                        <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                        Loading documents…
                    </div>
                )}
                {isError && (
                    <Notice tone="danger">
                        Documents are temporarily unavailable.
                    </Notice>
                )}
                {!isLoading && !isError && (documents?.length ?? 0) === 0 && (
                    <p className="rounded-group border border-dashed border-separator px-3 py-6 text-center type-body text-ink-muted">
                        {emptyMessage ??
                            "No documents yet. Upload a PDF, DOCX, XLSX, CSV, TXT, or Markdown file."}
                    </p>
                )}

                <ul className="divide-y divide-separator">
                    {(documents ?? []).map((document) => (
                        <li
                            key={document.id}
                            data-status={document.status}
                            className="flex flex-wrap items-center gap-3 py-3"
                        >
                            <FileText aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate type-body font-medium text-ink">
                                    {document.file_name}
                                </p>
                                <p className="type-meta text-ink-muted">
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
                                        <RotateCcw aria-hidden="true" className="size-3.5" />
                                    </Button>
                                )}
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:text-danger-hover"
                                disabled={deletingId === document.id}
                                aria-busy={deletingId === document.id}
                                onClick={() => onDelete(document)}
                                aria-label={`Delete ${document.file_name}`}
                            >
                                {deletingId === document.id ? (
                                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                                ) : (
                                    <Trash2 aria-hidden="true" className="size-3.5" />
                                )}
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
