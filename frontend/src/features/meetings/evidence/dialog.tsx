"use client";

/**
 * One accessible read-only evidence dialog, shared by live and replay.
 */

import * as React from "react";
import {
    AlertTriangle,
    ExternalLink,
    FileText,
    Loader2,
    RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    EvidenceCitationContext,
    EvidenceDescriptor,
    EvidenceLoadError,
    EvidenceViewState,
} from "./contract";
import { EvidenceContentRenderer } from "./renderers";

export interface EvidencePreviewDialogProps {
    open: boolean;
    descriptor: EvidenceDescriptor | null;
    citation: EvidenceCitationContext;
    state: EvidenceViewState;
    onClose: () => void;
    onRetry: () => void;
}

function errorCopy(error: EvidenceLoadError): { title: string; detail: string } {
    switch (error.kind) {
        case "offline":
            return {
                title: "You appear to be offline",
                detail: "Reconnect and retry the preview.",
            };
        case "cors":
            return {
                title: "The evidence host blocked this request",
                detail: "The recorded asset could not be fetched from its declared origin.",
            };
        case "timeout":
            return {
                title: "The preview timed out",
                detail: "The evidence host did not respond in time.",
            };
        case "http":
            return {
                title: "The evidence could not be loaded",
                detail: error.message,
            };
        case "too_large":
            return {
                title: "This file is too large to preview",
                detail: "The retained source exceeds the in-app preview limit.",
            };
        case "wrong_type":
            return {
                title: "This format cannot be previewed",
                detail: "The response did not match the recorded evidence type.",
            };
        case "integrity":
            return {
                title: "The evidence failed its integrity check",
                detail: "The retained bytes do not match the recorded revision or asset.",
            };
        case "parser":
            return {
                title: "This file could not be read safely",
                detail: "The evidence could not be converted into a readable preview.",
            };
        case "unsupported":
            return {
                title: "This format is not supported",
                detail: "No safe in-app renderer exists for this evidence type.",
            };
        case "unavailable":
            return {
                title: "This evidence is unavailable",
                detail: error.message,
            };
        case "aborted":
            return {
                title: "Preview cancelled",
                detail: "The request was cancelled.",
            };
        default:
            return {
                title: "The evidence could not be loaded",
                detail: error.message,
            };
    }
}

function Provenance({ descriptor }: { descriptor: EvidenceDescriptor }) {
    const { provenance } = descriptor;
    const rows: Array<[string, string]> = [];
    if (provenance.source) rows.push(["Source", provenance.source]);
    if (provenance.captured_at) rows.push(["Captured", provenance.captured_at]);
    if (provenance.rights) rows.push(["Rights", provenance.rights]);
    if (provenance.extraction) {
        rows.push(["Extraction", provenance.extraction]);
    }
    if (provenance.detail) rows.push(["Identity", provenance.detail]);

    return (
        <section aria-label="Evidence provenance" className="material-raised rounded-group border border-separator">
            <details className="p-3">
                <summary className="m-control cursor-pointer type-control text-ink">
                    Provenance and rights
                </summary>
                <div className="mt-2 type-meta">
                    <p className="font-medium text-ink">{provenance.label}</p>
                    {rows.length > 0 ? (
                        <dl className="mt-2 grid gap-1 sm:grid-cols-[7rem_1fr]">
                            {rows.map(([label, value]) => (
                                <React.Fragment key={label}>
                                    <dt className="text-ink-muted">{label}</dt>
                                    <dd className="break-words text-ink-secondary">
                                        {value}
                                    </dd>
                                </React.Fragment>
                            ))}
                        </dl>
                    ) : null}
                </div>
            </details>
        </section>
    );
}

function formatLabel(mediaType: EvidenceDescriptor["media_type"]): string {
    switch (mediaType) {
        case "text/markdown":
            return "Markdown";
        case "text/plain":
            return "Plain text";
        case "text/csv":
            return "CSV table";
        case "application/json":
            return "JSON";
        case "application/pdf":
            return "PDF";
        default:
            return mediaType;
    }
}

function LoadingState() {
    return (
        <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 py-10 type-body text-ink-muted"
        >
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            Loading evidence…
        </div>
    );
}

function ErrorState({
    error,
    onRetry,
}: {
    error: EvidenceLoadError;
    onRetry: () => void;
}) {
    const copy = errorCopy(error);
    return (
        <div
            role="alert"
            className="space-y-3 rounded-group border border-danger/40 bg-danger-soft p-4"
        >
            <div className="flex items-center gap-2 type-item-title text-danger">
                <AlertTriangle className="size-4" />
                {copy.title}
            </div>
            <p className="type-body text-ink-secondary">{copy.detail}</p>
            {error.retryable ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                    <RotateCcw className="size-3.5" />
                    Retry preview
                </Button>
            ) : null}
        </div>
    );
}

export function EvidencePreviewDialog({
    open,
    descriptor,
    citation,
    state,
    onClose,
    onRetry,
}: EvidencePreviewDialogProps) {
    const unavailable =
        descriptor !== null && descriptor.readiness !== "ready";
    const externalUrl =
        citation.external_url ?? descriptor?.external_url ?? null;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="max-h-[88vh] w-[min(64rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-4xl motion-reduce:animate-none">
                <div className="flex max-h-[88vh] min-h-0 flex-col">
                    <DialogHeader className="border-b border-separator px-6 py-4 text-left">
                        <DialogTitle className="flex items-center gap-2 pr-8">
                            <FileText aria-hidden="true" className="size-4 shrink-0" />
                            <span className="break-words">
                                {descriptor?.title ?? "Evidence preview"}
                            </span>
                        </DialogTitle>
                        <DialogDescription>
                            {descriptor
                                ? `${formatLabel(descriptor.media_type)} · retained source`
                                : "Retained source preview"}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                        {citation.excerpt ? (
                            <section aria-label="Cited excerpt">
                                <h3 className="type-meta-strong uppercase tracking-wide text-ink-muted">
                                    Cited excerpt
                                </h3>
                                <blockquote className="mt-1 border-l-2 border-action pl-3 type-body italic text-ink-secondary">
                                    “{citation.excerpt}”
                                </blockquote>
                            </section>
                        ) : null}
                        {citation.locator ? (
                            <p className="type-meta text-ink-muted">
                                Locator: {citation.locator}
                            </p>
                        ) : null}

                        {descriptor ? <Provenance descriptor={descriptor} /> : null}

                        {unavailable ? (
                            <div
                                role="alert"
                                className="rounded-group border border-warning/40 bg-warning-soft p-4 type-body"
                            >
                                <p className="font-medium text-warning">Evidence unavailable</p>
                                <p className="mt-1 text-ink-secondary">
                                    {descriptor?.unavailable_reason ??
                                        "This evidence is no longer retained or is not ready."}
                                </p>
                            </div>
                        ) : state.status === "loading" ? (
                            <LoadingState />
                        ) : state.status === "error" ? (
                            <ErrorState error={state.error} onRetry={onRetry} />
                        ) : state.status === "ready" && descriptor ? (
                            <EvidenceContentRenderer
                                descriptor={descriptor}
                                content={state.content}
                            />
                        ) : null}

                        {externalUrl ? (
                            <div className="border-t border-separator pt-3">
                                <a
                                    href={externalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    className="inline-flex items-center gap-1 type-meta text-action underline hover:text-action-hover"
                                >
                                    Open original source
                                    <ExternalLink className="size-3" />
                                </a>
                                <p className="mt-1 type-meta text-ink-muted">
                                    Secondary action only. The preview never
                                    falls back to this link.
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
