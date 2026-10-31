"use client";

/**
 * Pure ingestion progress presentation, shared by live and demo adapters.
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
    onRetry?: (operationId: string) => void;
    retrying?: boolean;
}

function stateCopy(progress: IngestionProgressView | null | undefined): {
    label: string;
    tone: "pending" | "ready" | "failed" | "revoked";
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

export function UploadProgressView({
    operationId,
    progress,
    isError,
    fileName,
    onRetry,
    retrying,
}: UploadProgressViewProps) {
    const copy = stateCopy(progress);

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
            {copy.tone === "pending" && (
                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            )}
            {copy.tone === "ready" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
            {copy.tone === "failed" && (
                <AlertTriangle className="h-4 w-4 text-red-400" />
            )}
            {copy.tone === "revoked" && <XCircle className="h-4 w-4 text-zinc-400" />}
            <span className="font-medium text-zinc-200">
                {fileName ?? progress?.fileName ?? "Upload"}
            </span>
            <Badge variant={copy.tone === "failed" ? "destructive" : "secondary"}>
                {copy.label}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-zinc-400">{copy.detail}</span>
            {isError && (
                <span className="text-red-400">Progress is temporarily unavailable.</span>
            )}
            {onRetry && (copy.tone === "failed" || isError) && (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={retrying}
                    onClick={() => onRetry(operationId)}
                >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Retry
                </Button>
            )}
        </div>
    );
}
