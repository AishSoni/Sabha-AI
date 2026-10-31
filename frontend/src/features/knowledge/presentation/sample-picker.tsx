"use client";

/**
 * Restricted practice upload picker (spec-25).
 *
 * The dialog only offers package-declared samples. It never opens the OS file
 * chooser, accepts drag-and-drop files, or treats an `accept` attribute as an
 * allowlist.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Lock } from "lucide-react";
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
        <Badge variant="outline" className="gap-1 text-zinc-400">
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
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100">
                <DialogHeader>
                    <DialogTitle>Add a prepared sample</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Choose from the approved practice library. Your own files
                        are never opened, and processing is simulated locally.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
                    <p className="text-zinc-300">
                        Destination:{" "}
                        <span className="font-medium text-zinc-100">
                            {destinationLabel}
                        </span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{audienceLabel}</p>
                </div>

                <fieldset className="space-y-2">
                    <legend className="sr-only">Approved samples</legend>
                    {samples.length === 0 && (
                        <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                            No prepared samples are available for this
                            destination.
                        </p>
                    )}
                    {samples.map((sample) => {
                        const added = isAlreadyAdded(sample);
                        const checked = sample.sampleId === selectedId;
                        const inputId = `sample-${sample.sampleId}`;
                        return (
                            <div
                                key={sample.sampleId}
                                className={`rounded-lg border px-3 py-3 ${
                                    checked
                                        ? "border-emerald-800/70 bg-emerald-950/20"
                                        : "border-zinc-800 bg-zinc-900/40"
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        id={inputId}
                                        type="radio"
                                        name="approved-sample"
                                        className="mt-1 h-4 w-4 accent-emerald-500"
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
                                            <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                                            <span className="break-all text-sm font-medium text-zinc-100">
                                                {sample.fileName}
                                            </span>
                                            <Badge variant="secondary">
                                                {sample.mediaType.split("/")[1]?.toUpperCase() ??
                                                    sample.mediaType}
                                            </Badge>
                                            <span className="text-xs text-zinc-500">
                                                {formatBytes(sample.sizeBytes)}
                                            </span>
                                            {added && <AlreadyAddedBadge />}
                                        </span>
                                        <span
                                            id={`${inputId}-description`}
                                            className="mt-1 block text-sm text-zinc-400"
                                        >
                                            {sample.description}
                                        </span>
                                        <span className="mt-1 block text-xs text-zinc-500">
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

                <p className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    Adding a sample stages a local document. It becomes eligible
                    only after the prepared simulation reports Ready.
                </p>

                <div aria-live="polite" className="min-h-5 text-sm">
                    {error && (
                        <p className="flex items-center gap-2 text-red-300">
                            <AlertTriangle className="h-4 w-4" />
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
                        disabled={!selected || selectedBlocked || submitting}
                        onClick={() => void confirm()}
                    >
                        {submitting && (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        )}
                        Add sample
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
