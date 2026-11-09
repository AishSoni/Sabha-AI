"use client";

/**
 * Pure ingestion progress presentation, shared by live and demo adapters.
 *
 * Progress observation and ingestion restart are deliberately separate
 * actions: a failed status read can only ask for a fresh read, while only a
 * recorded ingestion failure offers the restart command.
 */
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IngestionProgressView } from "./contract";

export interface UploadProgressViewProps {
    operationId: string;
    progress?: IngestionProgressView | null;
    isError?: boolean;
    fileName?: string;
    onRefresh?: () => void;
    refreshing?: boolean;
    onRetry?: (operationId: string) => void;
    retrying?: boolean;
}

function stateCopy(progress: IngestionProgressView | null | undefined): {
    label: string;
    tone: "pending" | "ready" | "failed" | "revoked" | "unknown";
    detail: string;
} {
    if (!progress) {
        return {
            label: "Queued",
            tone: "pending",
            detail: "Waiting for the ingestion worker…",
        };
    }
    if (progress.state === "ready") {
        return {
            label: "Ready",
            tone: "ready",
            detail: `${progress.chunkCount} chunks are eligible for retrieval.`,
        };
    }
    if (progress.state === "failed") {
        return {
            label: "Failed",
            tone: "failed",
            detail:
                progress.errorMessage ??
                "Ingestion failed. Retry keeps the same document and operation.",
        };
    }
    if (progress.state === "revoked") {
        return {
            label: "Revoked",
            tone: "revoked",
            detail: "This upload was revoked before it became eligible.",
        };
    }
    if (progress.state === "processing") {
        return {
            label: "Indexing",
            tone: "pending",
            detail: "Parsing and indexing the original file…",
        };
    }
    return {
        label: "Queued",
        tone: "pending",
        detail: "The durable ingestion job is waiting to start.",
    };
}

function observedCopy(
    progress: IngestionProgressView | null | undefined,
    isError: boolean | undefined
) {
    if (!isError) return stateCopy(progress);
    return {
        label: "Status unavailable",
        tone: "unknown" as const,
        detail: "Progress could not be read. Refresh status to try again.",
    };
}

export function UploadProgressView({
    operationId,
    progress,
    isError,
    fileName,
    onRefresh,
    refreshing,
    onRetry,
    retrying,
}: UploadProgressViewProps) {
    const copy = observedCopy(progress, isError);

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-separator bg-surface-raised px-3 py-2 type-meta">
            {copy.tone === "pending" && (
                <Loader2 className="size-4 animate-spin text-warning motion-reduce:animate-none" />
            )}
            {copy.tone === "ready" && (
                <CheckCircle2 className="size-4 text-success" />
            )}
            {(copy.tone === "failed" || copy.tone === "unknown") && (
                <AlertTriangle className="size-4 text-danger" />
            )}
            {copy.tone === "revoked" && <XCircle className="size-4 text-ink-secondary" />}
            <span className="type-control font-medium text-ink">
                {fileName ?? progress?.fileName ?? "Upload"}
            </span>
            <Badge
                variant={
                    copy.tone === "ready"
                        ? "success"
                        : copy.tone === "failed"
                          ? "destructive"
                          : copy.tone === "pending"
                            ? "warning"
                            : "secondary"
                }
            >
                {copy.label}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-ink-secondary">{copy.detail}</span>
            {isError && onRefresh && (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    busy={refreshing}
                    busyLabel="Refreshing"
                    onClick={onRefresh}
                >
                    <RotateCcw className="mr-1 size-3.5" />
                    Refresh status
                </Button>
            )}
            {!isError && copy.tone === "failed" && onRetry && (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    busy={retrying}
                    busyLabel="Retrying"
                    onClick={() => onRetry(operationId)}
                >
                    <RotateCcw className="mr-1 size-3.5" />
                    Retry ingestion
                </Button>
            )}
        </div>
    );
}
