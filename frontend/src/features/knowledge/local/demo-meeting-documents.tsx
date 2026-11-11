"use client";

/**
 * Shared meeting-wide sample inventory for the main demo journey (spec-43).
 *
 * Setup, the room Files tab, and the shared knowledge stack all render this
 * same adapter. It is scoped to the prepared meeting ID, so a queued, failed,
 * or ready document has one identity everywhere. Source verification and the
 * browser-only document machine stay in the local knowledge adapter.
 */
import { useId, useState, type ReactNode } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    FilePlus2,
    FileText,
    Loader2,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDemoWorkspace, type WorkspaceSample } from "@/features/demo-workspace";
import { useLocalDocuments } from "../local/use-local-documents";
import type { KnowledgeDocumentView } from "./contract";
import { SamplePicker } from "./sample-picker";

export type DemoMeetingDocumentsMode = "setup" | "room" | "stack";

export interface DemoMeetingDocumentsProps {
    meetingId: string;
    mode: DemoMeetingDocumentsMode;
    renderPreviewAction?: (sample: WorkspaceSample) => ReactNode;
    className?: string;
}

const COPY = {
    setup: {
        title: "Added samples",
        description:
            "Optional approved samples for this meeting. They are verified against published demo assets and processed in this browser.",
        empty:
            "No approved sample has been added. Creating the meeting does not require one.",
    },
    room: {
        title: "Added to this demo",
        description:
            "Approved samples added in this browser. Ready samples are shared with every captured participant.",
        empty: "No approved sample was added to this meeting.",
    },
    stack: {
        title: "Meeting-wide documents",
        description:
            "Added for this meeting in this browser. They are shared with every captured participant in addition to stack assignments.",
        empty: "No meeting-wide sample was added.",
    },
} as const;

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
    return (
        <StatusBadge tone="pending">
            {document.status === "pending" ? "Queued" : "Indexing"}
        </StatusBadge>
    );
}

function formatSize(bytes: number): string {
    return `${(bytes / 1024).toFixed(0)} KB`;
}

export function DemoMeetingDocuments({
    meetingId,
    mode,
    renderPreviewAction,
    className,
}: DemoMeetingDocumentsProps) {
    const workspace = useDemoWorkspace();
    const headingId = useId();
    const [pickerOpen, setPickerOpen] = useState(false);
    const copy = COPY[mode];
    const documents = useLocalDocuments(
        { kind: "meeting", id: meetingId },
        {
            audienceLabel:
                "Every participant captured in this demo can retrieve a ready meeting document.",
        }
    );
    const eligibleSamples = documents.samples.filter((sample) =>
        sample.destinationKinds.includes("meeting")
    );
    const allAdded =
        eligibleSamples.length > 0 &&
        eligibleSamples.every((sample) => documents.isAlreadyAdded(sample));

    if (mode !== "setup" && documents.documents.length === 0) {
        return null;
    }

    let disabledReason: string | null = null;
    if (!workspace.expanded) {
        disabledReason =
            "Sample addition is unavailable for this recording version.";
    } else if (eligibleSamples.length === 0) {
        disabledReason = "No approved meeting samples are available.";
    } else if (allAdded) {
        disabledReason =
            "Every approved meeting sample is already added. Retry or remove one to add it again.";
    }

    return (
        <section
            aria-labelledby={headingId}
            className={className ?? "space-y-3"}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 id={headingId} className="type-item-title">
                        {copy.title}
                    </h3>
                    <p className="mt-1 type-body text-ink-secondary">
                        {copy.description}
                    </p>
                </div>
                {mode === "setup" && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        busy={documents.uploading}
                        busyLabel="Adding sample"
                        disabled={disabledReason !== null}
                        title={disabledReason ?? undefined}
                        onClick={() => setPickerOpen(true)}
                    >
                        <FilePlus2 className="mr-1 size-4" />
                        Add approved sample
                    </Button>
                )}
            </div>

            {mode === "setup" && disabledReason && (
                <p className="type-meta text-ink-muted">{disabledReason}</p>
            )}

            {(documents.localError ?? documents.isError) && (
                <p
                    role="alert"
                    className="flex items-start gap-2 rounded-group border border-danger/40 bg-danger-soft px-3 py-2 type-body text-danger"
                >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {documents.localError ??
                        "Meeting documents are temporarily unavailable."}
                </p>
            )}

            {documents.isLoading && (
                <p
                    role="status"
                    className="flex items-center gap-2 type-body text-ink-muted"
                >
                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                    Loading meeting documents…
                </p>
            )}

            {!documents.isLoading &&
                !documents.isError &&
                documents.documents.length === 0 && (
                    <p className="rounded-group border border-dashed border-separator px-3 py-4 type-body text-ink-muted">
                        {copy.empty}
                    </p>
                )}

            {documents.documents.length > 0 && (
                <ul className="space-y-2">
                    {documents.documents.map((document) => {
                        const sample = documents.sampleForDocument(document);
                        return (
                            <li
                                key={document.id}
                                className="flex flex-wrap items-center gap-3 rounded-group border border-separator bg-surface-raised/40 px-3 py-2"
                            >
                                <FileText className="size-4 shrink-0 text-ink-muted" />
                                <div className="min-w-0 flex-1">
                                    <p className="break-all type-body font-medium text-ink">
                                        {document.file_name}
                                    </p>
                                    <p className="type-meta text-ink-muted">
                                        {document.file_type.toUpperCase()} ·{" "}
                                        {formatSize(document.file_size_bytes)} ·
                                        Added in this browser
                                        {document.error_message
                                            ? ` · ${document.error_message}`
                                            : ""}
                                    </p>
                                </div>
                                {statusBadge(document)}
                                {document.status === "ready" &&
                                    sample?.previewMode === "inline" &&
                                    renderPreviewAction?.(sample)}
                                {document.operation_id &&
                                    document.status === "failed" && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                                documents.retryDocument(
                                                    document.operation_id!
                                                )
                                            }
                                            aria-label={`Retry ${document.file_name}`}
                                        >
                                            <RotateCcw className="size-3.5" />
                                        </Button>
                                    )}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-danger hover:text-danger-hover"
                                    disabled={documents.removingId === document.id}
                                    aria-busy={
                                        documents.removingId === document.id
                                    }
                                    onClick={() =>
                                        documents.removeDocument(document)
                                    }
                                    aria-label={`Remove ${document.file_name}`}
                                >
                                    {documents.removingId === document.id ? (
                                        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                                    ) : (
                                        <Trash2 className="size-3.5" />
                                    )}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {mode === "setup" && (
                <SamplePicker
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    samples={eligibleSamples}
                    destinationLabel="This demo meeting"
                    audienceLabel="Every participant captured in this demo can retrieve a ready meeting document."
                    isAlreadyAdded={(sample) =>
                        documents.isAlreadyAdded(sample)
                    }
                    onConfirm={(sample) => documents.addSample(sample)}
                    renderPreviewAction={renderPreviewAction}
                />
            )}
        </section>
    );
}
