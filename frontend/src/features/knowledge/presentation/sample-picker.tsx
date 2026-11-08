"use client";

/**
 * Restricted practice upload picker (spec-25).
 *
 * The dialog only offers package-declared samples. It never opens the OS file
 * chooser, accepts drag-and-drop files, or treats an `accept` attribute as an
 * allowlist.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { WorkspaceSample } from "@/features/demo-workspace";

export interface SamplePickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    samples: readonly WorkspaceSample[];
    destinationLabel: string;
    audienceLabel: string;
    isAlreadyAdded: (sample: WorkspaceSample) => boolean;
    onConfirm: (
        sample: WorkspaceSample
    ) => Promise<{ ok: true } | { ok: false; error: string }>;
    renderPreviewAction?: (sample: WorkspaceSample) => ReactNode;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

function AlreadyAddedBadge() {
    return (
        <Badge variant="outline" className="gap-1 text-ink-secondary">
            <Lock className="h-3 w-3" />
            Already added
        </Badge>
    );
}

export function SamplePicker({
    open,
    onOpenChange,
    samples,
    destinationLabel,
    audienceLabel,
    isAlreadyAdded,
    onConfirm,
    renderPreviewAction,
}: SamplePickerProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const first = samples.find((sample) => !isAlreadyAdded(sample));
        setSelectedId(first?.sampleId ?? null);
        setError(null);
        setSubmitting(false);
        // The dialog opens fresh; changes while it is open keep the selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const selected = samples.find((sample) => sample.sampleId === selectedId);
    const selectedBlocked = selected ? isAlreadyAdded(selected) : false;

    async function confirm() {
        if (!selected || selectedBlocked || submitting) return;
        setSubmitting(true);
        setError(null);
        const result = await onConfirm(selected);
        setSubmitting(false);
        if (result.ok) {
            onOpenChange(false);
            return;
        }
        setError(result.error);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add a sample</DialogTitle>
                    <DialogDescription>
                        Choose from the sample library. Your own files
                        are never opened, and processing is simulated locally.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-control border border-separator bg-surface-raised px-3 py-2 type-body">
                    <p className="text-ink-secondary">
                        Destination:{" "}
                        <span className="font-medium text-ink">
                            {destinationLabel}
                        </span>
                    </p>
                    <p className="mt-1 type-meta text-ink-muted">{audienceLabel}</p>
                </div>

                <fieldset className="space-y-2">
                    <legend className="sr-only">Samples</legend>
                    {samples.length === 0 && (
                        <p className="rounded-control border border-dashed border-separator px-3 py-6 text-center type-body text-ink-muted">
                            No samples are available for this destination.
                        </p>
                    )}
                    {samples.map((sample) => {
                        const added = isAlreadyAdded(sample);
                        const checked = sample.sampleId === selectedId;
                        const inputId = `sample-${sample.sampleId}`;
                        return (
                            <div
                                key={sample.sampleId}
                                className={`m-control rounded-control border px-3 py-3 ${
                                    checked
                                        ? "border-action/50 bg-accent-soft"
                                        : "border-separator bg-surface-raised/40"
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        id={inputId}
                                        type="radio"
                                        name="approved-sample"
                                        className="mt-1 size-4 accent-action"
                                        checked={checked}
                                        disabled={added}
                                        aria-describedby={`${inputId}-description`}
                                        onChange={() => {
                                            setSelectedId(sample.sampleId);
                                            setError(null);
                                        }}
                                    />
                                    <label
                                        htmlFor={inputId}
                                        className="min-w-0 flex-1 cursor-pointer"
                                    >
                                        <span className="flex flex-wrap items-center gap-2">
                                            <FileText className="size-4 shrink-0 text-ink-muted" />
                                            <span className="break-all type-control font-medium text-ink">
                                                {sample.fileName}
                                            </span>
                                            <Badge variant="secondary">
                                                {sample.mediaType.split("/")[1]?.toUpperCase() ??
                                                    sample.mediaType}
                                            </Badge>
                                            <span className="type-meta text-ink-muted">
                                                {formatBytes(sample.sizeBytes)}
                                            </span>
                                            {added && <AlreadyAddedBadge />}
                                        </span>
                                        <span
                                            id={`${inputId}-description`}
                                            className="mt-1 block type-body text-ink-secondary"
                                        >
                                            {sample.description}
                                        </span>
                                        <span className="mt-1 block type-meta text-ink-muted">
                                            {sample.previewMode === "inline"
                                                ? "Preview available after it is attached."
                                                : `Preview unavailable: ${
                                                      sample.previewNote ??
                                                      "this format cannot be shown in the app."
                                                  }`}
                                        </span>
                                    </label>
                                    {!added && renderPreviewAction?.(sample)}
                                </div>
                            </div>
                        );
                    })}
                </fieldset>

                <p className="flex items-start gap-2 rounded-control border border-separator bg-surface-raised/40 px-3 py-2 type-meta text-ink-muted">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                    Adding a sample stages a local document. It becomes eligible
                    only after processing reports Ready.
                </p>

                <div aria-live="polite" className="min-h-5 type-body">
                    {error && (
                        <p role="alert" className="flex items-center gap-2 text-danger">
                            <AlertTriangle className="size-4" />
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        busy={submitting}
                        busyLabel="Adding sample"
                        disabled={!selected || selectedBlocked}
                        onClick={() => void confirm()}
                    >
                        Add sample
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
