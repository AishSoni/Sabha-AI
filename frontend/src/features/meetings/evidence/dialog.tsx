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
        <section
            aria-label="Evidence provenance"
            className="rounded-md border bg-muted/30 p-3 text-xs"
        >
            <p className="font-medium">{provenance.label}</p>
            {rows.length > 0 ? (
                <dl className="mt-2 grid gap-1 sm:grid-cols-[7rem_1fr]">
                    {rows.map(([label, value]) => (
                        <React.Fragment key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="break-words">{value}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            ) : null}
        </section>
    );
}

function LoadingState() {
    return (
        <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 py-10 text-sm text-muted-foreground"
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
            className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
            <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" />
                {copy.title}
            </div>
            <p className="text-sm text-muted-foreground">{copy.detail}</p>
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

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="max-h-[88vh] w-[min(64rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0 sm:max-w-4xl motion-reduce:animate-none">
                <div className="flex max-h-[88vh] min-h-0 flex-col">
                    <DialogHeader className="border-b px-6 py-4 text-left">
                        <DialogTitle className="flex items-center gap-2 pr-8">
                            <FileText className="size-4 shrink-0" />
                            <span className="break-words">
                                {descriptor?.title ?? "Evidence preview"}
                            </span>
                        </DialogTitle>
                        <DialogDescription>
                            Read-only evidence preview. No changes can be made
                            from this dialog.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                        {citation.excerpt ? (
                            <blockquote className="border-l-2 pl-3 text-sm italic">
                                “{citation.excerpt}”
                            </blockquote>
                        ) : null}
                        {citation.locator ? (
                            <p className="text-xs text-muted-foreground">
                                Locator: {citation.locator}
                            </p>
                        ) : null}

                        {descriptor ? <Provenance descriptor={descriptor} /> : null}

                        {unavailable ? (
                            <div
                                role="alert"
                                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
                            >
                                <p className="font-medium">Evidence unavailable</p>
                                <p className="mt-1 text-muted-foreground">
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

                        {citation.external_url ? (
                            <div className="border-t pt-3">
                                <a
                                    href={citation.external_url}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    className="inline-flex items-center gap-1 text-xs underline"
                                >
                                    Open original source
                                    <ExternalLink className="size-3" />
                                </a>
                                <p className="mt-1 text-xs text-muted-foreground">
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
